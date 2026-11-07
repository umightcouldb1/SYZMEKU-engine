const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {hash,qa}=require('../enterprise/content/qa'),catalog=require('../enterprise/content/catalog'),{voiceCheck}=require('../enterprise/content/voice');
const service=require('../enterprise/content/service'),{createStore}=require('../enterprise/content/driveDraftStore'),{createMediaReader}=require('../enterprise/content/driveMedia');
const {fakeGoogle,seedLegacy}=require('./contentDriveFixture.cjs');
let f,db,google,store,reader,originalFetch,oldTokenGetter;
before(async()=>{
 f=await require('./patternFixture.cjs')({mongoArgs:['--nounixsocket']});db=f.mongoose.connection.db;Object.assign(process.env,{ENTERPRISE_INTELLIGENCE_ENABLED:'true',ENTERPRISE_OWNER_USER_ID:f.founder.id,CONTENT_FACTORY_ENABLED:'true',CONTENT_FACTORY_START_DATE:'2026-11-07'});
 google=fakeGoogle(f.founder.id);store=createStore({db,owner:f.founder.id,workspace:google.workspace,fetchImpl:google.fetchImpl});reader=await createMediaReader({owner:f.founder.id,workspaceImpl:google.workspace,fetchImpl:google.fetchImpl});
 const workspace=require('../enterprise/content/workspaceConnection');oldTokenGetter=workspace.getFreshAccessToken;workspace.getFreshAccessToken=google.workspace.getFreshAccessToken;
 originalFetch=global.fetch;global.fetch=(url,options)=>String(url).startsWith('https://www.googleapis.com/')?google.fetchImpl(url,options):originalFetch(url,options);
 f.app.use('/api/content-factory',require('../routes/contentFactoryRoutes'));f.app.use('/api/social-command',require('../routes/socialCommandRoutes'));f.app.use((e,_req,res,_next)=>res.status(e.statusCode||(res.statusCode>=400?res.statusCode:500)).json({code:e.message}));
});
after(async()=>{global.fetch=originalFetch;require('../enterprise/content/workspaceConnection').getFreshAccessToken=oldTokenGetter;await f?.close();});
const get=async id=>(await service.list(db,f.founder.id,{store})).items.find(x=>x.id===id);
const unchangedMongo=async(before)=>assert.deepEqual(await db.collection('enterprisestates').find({kind:'C0_ITEM'}).toArray(),before);
test('legacy voice/scene checks remain historical evidence, not image approval',()=>{
 const p=catalog.variant('facebook');assert.equal(voiceCheck('level up your life').status,'FAIL');assert.equal(voiceCheck('A possibility is not a conclusion.').status,'PASS');assert.equal(qa(p).canApprove,false);assert(qa(p).checks.some(c=>c.id==='founder_selected_images'&&c.status==='PENDING'));assert.equal(catalog.calendar().length,7);
});
test('due preparation writes packages only to Drive and is restart-safe without fallback',async()=>{
 const before=await db.collection('enterprisestates').find({kind:'C0_ITEM'}).toArray();const r=await service.prepareDaily({db,store,now:new Date('2026-11-07T18:00:00Z')});assert(r.created>0);assert.equal((await service.prepareDaily({db,store,now:new Date('2026-11-07T18:00:00Z')})).created,0);await unchangedMongo(before);
 const records=await store.list();assert(records.every(d=>d.versions.every(v=>!v.package.scenes.some(s=>s.visual?.svg))));assert(records.every(d=>current(d).package.production.status==='IMAGE_SELECTION_REQUIRED'));
 const pointers=await db.collection('enterprisestates').find({kind:'C0_DRIVE_DRAFT_POINTER'}).toArray();assert(pointers.length>0);assert(pointers.every(p=>!JSON.stringify(p).includes('narration')&&!p.versions&&!p.package));assert.equal(await db.collection('socialcampaigns').countDocuments({}),0);
 assert.equal((await service.prepareDaily({db,store,env:{...process.env,CONTENT_FACTORY_START_DATE:''}})).status,'START_DATE_REQUIRED');assert.equal((await service.prepareDaily({db,store,now:new Date('2026-11-20')})).status,'CALENDAR_COMPLETE_OR_NOT_STARTED');
});
const current=d=>d.versions.find(v=>v.number===d.currentVersion);
test('legacy record edits fork Drive without mutation; stale revisions are rejected',async()=>{
 const legacy=await seedLegacy(db,f.founder.id,'legacy-preserved',catalog.variant('facebook'));
 await service.change({db,owner:f.founder.id,id:legacy.itemId,expectedHash:current(legacy).hash,action:'EDIT',patch:{title:'Who owns this hour?'},store});
 assert.deepEqual(await db.collection('enterprisestates').findOne({_id:legacy._id}),legacy);
 let item=await get(legacy.itemId);assert.equal(item.storage.provider,'GOOGLE_DRIVE');const stale=item.revision;
 await service.change({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,action:'HOLD',store});
 await assert.rejects(service.change({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:stale,action:'REJECT',store}),/CONTENT_VERSION_CHANGED/);
 assert.equal((await get(item.id)).status,'HOLD');
});
test('image selection precedes video review; checksums and original reference are bound',async()=>{
 const item=await get('variant-b-facebook');const checks=Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true]));
 await assert.rejects(service.attachReviewedMedia({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,media:{fileId:'review_video_123456',sha256:google.files.get('review_video_123456').meta.sha256Checksum,duration:24},checks,store,mediaReader:reader}),/FOUNDER_IMAGE_APPROVAL_REQUIRED/);
 await service.approveImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,images:item.package.scenes.map((_,sceneIndex)=>({sceneIndex,fileId:'source_image_123456',sha256:google.files.get('source_image_123456').meta.sha256Checksum})),referenceSha256:google.files.get(require('../enterprise/content/driveMedia').ORIGINAL_LOGO_FILE_ID).meta.sha256Checksum,store,mediaReader:reader});
 const selected=await get(item.id);assert(selected.package.production.imageApproval.selectionHash);assert.equal(selected.package.production.media,null);assert.equal(selected.package.visual.version,'FOUNDER_REFERENCE_IMAGES_V1');
 google.asset('source_image_123456','image/png','changed-image');
 await assert.rejects(service.attachReviewedMedia({db,owner:f.founder.id,id:selected.id,expectedHash:selected.hash,expectedRevision:selected.revision,media:{fileId:'review_video_123456',sha256:google.files.get('review_video_123456').meta.sha256Checksum,duration:24},checks,store,mediaReader:reader}),/APPROVED_IMAGE_CHANGED/);
 google.asset('source_image_123456','image/png','synthetic-image');
});
test('exact finished-video approval remains Drive-only and never makes a Social draft',async()=>{
 let item=await get('first-longform');
 await service.approveImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,images:item.package.scenes.map((_,sceneIndex)=>({sceneIndex,fileId:'source_image_123456',sha256:google.files.get('source_image_123456').meta.sha256Checksum})),referenceSha256:google.files.get(require('../enterprise/content/driveMedia').ORIGINAL_LOGO_FILE_ID).meta.sha256Checksum,store,mediaReader:reader});
 item=await get(item.id);await service.attachReviewedMedia({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,media:{fileId:'review_video_123456',sha256:google.files.get('review_video_123456').meta.sha256Checksum,duration:item.package.duration},checks:Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true])),store,mediaReader:reader});
 item=await get(item.id);assert.equal(item.qa.canApprove,true);await service.approveMany({db,owner:f.founder.id,items:[{id:item.id,hash:item.hash,version:item.version,revision:item.revision}],store,mediaReader:reader});
 assert.equal((await get(item.id)).status,'APPROVED');assert.equal(await db.collection('socialcampaigns').countDocuments({}),0);
 await assert.rejects(service.approveMany({db,owner:f.founder.id,items:[{id:item.id,hash:item.hash,version:item.version,revision:item.revision}],store,mediaReader:reader}),/CONTENT_VERSION_CHANGED/);
});
test('owner gates, Drive-only exports and exact Slides request gates hold over HTTP',async()=>{
 assert.equal((await f.request(f.other,'/api/content-factory')).status,404);assert.equal((await f.request(null,'/api/content-factory')).status,401);
 for(const route of ['/api/content-factory/first-longform/bundle','/api/content-factory/first-longform/google-slides']){const r=await f.request(f.founder,route,route.endsWith('bundle')?'GET':'POST',route.endsWith('bundle')?undefined:{});assert.equal(r.status,409);}
 const original=await get('variant-b-instagram'),before=await db.collection('enterprisestates').find({kind:'C0_ITEM'}).toArray();
 assert.equal((await f.request(f.other,`/api/content-factory/${original.id}/image-approval`,'POST',{expectedHash:original.hash,images:[]})).status,404);
 const malformed=await f.request(f.founder,`/api/content-factory/${original.id}`,'PATCH',{expectedHash:original.hash,expectedRevision:original.revision,action:'HOLD',owner:f.other.id});assert.equal(malformed.status,400);await unchangedMongo(before);
});
test('queue reads do not create drafts and preserve readable history if Drive is unavailable',async()=>{
 const writes=[],listener=e=>{if(['insert','update','delete','findAndModify'].includes(e.commandName))writes.push(e.commandName);};f.mongoose.connection.getClient().on('commandStarted',listener);try{const data=await service.list(db,f.founder.id,{store});assert(data.items.length);assert.equal(data.storage.provider,'GOOGLE_DRIVE');}finally{f.mongoose.connection.getClient().off('commandStarted',listener);}assert.deepEqual(writes,[]);
 const unavailable={list:async()=>{throw Error('DRIVE_DRAFT_AUTH_REQUIRED');}};const data=await service.list(db,f.founder.id,{store:unavailable});assert.equal(data.storage.error,'DRIVE_DRAFT_AUTH_REQUIRED');assert(data.items.some(i=>i.id==='legacy-preserved'));
});
test('old media materializer no longer recreates records or changes founder decisions',async()=>{const before=await db.collection('enterprisestates').find({}).toArray();assert.equal((await service.materializeFounderReview()).status,'FOUNDER_IMAGE_APPROVAL_REQUIRED');assert.deepEqual(await db.collection('enterprisestates').find({}).toArray(),before);});
test('new feedback is saved in Drive and included in future voice rules',async()=>{
 const item=await get('variant-b-instagram');await service.change({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,action:'FEEDBACK',feedback:{phrase:'first move',replacement:'first step'},store});
 const voice=await service.voiceState(db,f.founder.id,{store});assert(voice.rules.some(r=>r.phrase==='first move'));assert.equal(await db.collection('enterprisestates').countDocuments({kind:'C0_VOICE'}),0);
});
test('ordinary final Social campaigns retain their publication boundary',async()=>{await service.assertPublication({db,campaign:{metadata:{},userId:'any'},post:{}});});
test('expected media snapshots and private ownership cannot be bypassed',async()=>{
 const item=await get('variant-b-instagram'),referenceSha256=google.files.get(require('../enterprise/content/driveMedia').ORIGINAL_LOGO_FILE_ID).meta.sha256Checksum;
 const images=item.package.scenes.map((_,sceneIndex)=>({sceneIndex,fileId:'source_image_123456',sha256:'0'.repeat(64)}));
 await assert.rejects(service.approveImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,images,referenceSha256,store,mediaReader:reader}),/APPROVED_IMAGE_CHANGED/);
 const asset=google.files.get('source_image_123456'),saved=asset.meta.permissions;
 asset.meta.permissions=[...saved,{type:'anyone',role:'reader'}];await assert.rejects(reader.inspect('source_image_123456','image'),/GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED/);asset.meta.permissions=saved;
 const video=await get('variant-b-facebook');await assert.rejects(service.attachReviewedMedia({db,owner:f.founder.id,id:video.id,expectedHash:video.hash,expectedRevision:video.revision,media:{fileId:'review_video_123456',sha256:'0'.repeat(64),duration:video.package.duration},checks:Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true])),store,mediaReader:reader}),/C0_MEDIA_CHANGED/);
});
test('Drive hold supersedes legacy public authorization without deleting legacy evidence',async()=>{
 const legacy=await seedLegacy(db,f.founder.id,'legacy-approved-superseded',catalog.variant('facebook'),'APPROVED'),version=current(legacy);
 const post={provider:'facebook',metadata:{}};const campaign={userId:f.founder.id,metadata:{c0:{itemId:legacy.itemId,hash:version.hash,postHash:service.postFingerprint(post)}}};
 await service.change({db,owner:f.founder.id,id:legacy.itemId,expectedHash:version.hash,action:'HOLD',store});
 await assert.rejects(service.assertPublication({db,campaign,post}),/C0_APPROVAL_INVALIDATED/);
 assert.deepEqual(await db.collection('enterprisestates').findOne({_id:legacy._id}),legacy);
});

test('Slides assembly locks a Drive job and reconciles retries without new uploads',async()=>{
 const source=await store.get('variant-b-facebook');
 async function fork(id){const record=JSON.parse(JSON.stringify(source));delete record._drive;record.itemId=id;record._id=service.key(f.founder.id,id);record.assembly=null;return store.save({id,expectedHash:null,record});}
 await fork('slides-assembly-fixture');let item=await get('slides-assembly-fixture');const requests=[];
 const assembler=async input=>{requests.push(input);return {presentationId:'synthetic_slides_123',url:'https://docs.google.com/presentation/d/synthetic_slides_123/edit',sourceHash:input.expectedHash,selectionHash:input.package.production.imageApproval.selectionHash,visualQA:'FOUNDER_REVIEW_REQUIRED'};};
 await service.assembleApprovedImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,store,mediaReader:reader,assembler});
 item=await get(item.id);assert.equal(item.assembly.status,'READY');assert.equal(requests[0].allowCreate,true);assert.equal(await db.collection('enterprisestates').countDocuments({kind:'C0_ITEM',itemId:item.id}),0);
 await service.assembleApprovedImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,store,mediaReader:reader,assembler});assert.equal(requests[1].allowCreate,false);assert.equal(requests[0].operationId,requests[1].operationId);
 await fork('slides-unknown-fixture');item=await get('slides-unknown-fixture');let attempts=[];const uncertain=async input=>{attempts.push(input);throw Object.assign(new Error('GOOGLE_SLIDES_OUTCOME_UNCERTAIN'),{statusCode:503});};
 await assert.rejects(service.assembleApprovedImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,store,mediaReader:reader,assembler:uncertain}),/GOOGLE_SLIDES_OUTCOME_UNCERTAIN/);
 item=await get(item.id);assert.equal(item.assembly.status,'PREPARING');await assert.rejects(service.assembleApprovedImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,store,mediaReader:reader,assembler:uncertain}),/GOOGLE_SLIDES_OUTCOME_UNCERTAIN/);assert.deepEqual(attempts.map(a=>a.allowCreate),[true,false]);assert.equal(attempts[0].operationId,attempts[1].operationId);
});
test('a founder hold during Slides assembly cannot be overwritten by completion',async()=>{
 let item=await get('slides-assembly-fixture');
 const assembler=async input=>{const currentItem=await get(item.id);await service.change({db,owner:f.founder.id,id:item.id,expectedHash:currentItem.hash,expectedRevision:currentItem.revision,action:'HOLD',store});return {presentationId:'synthetic_slides_123'};};
 await assert.rejects(service.assembleApprovedImages({db,owner:f.founder.id,id:item.id,expectedHash:item.hash,expectedRevision:item.revision,store,mediaReader:reader,assembler}),/CONTENT_VERSION_CHANGED/);assert.equal((await get(item.id)).status,'HOLD');
});
