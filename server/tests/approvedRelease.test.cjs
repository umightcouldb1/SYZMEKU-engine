require('./contentPrivateConfigFixture.cjs').configure();
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const service=require('../enterprise/content/service'),release=require('../enterprise/content/approvedRelease');
const {createStore,pointerKey}=require('../enterprise/content/driveDraftStore');
const {createMediaReader}=require('../enterprise/content/driveMedia');
const {ORIGINAL_LOGO_FILE_ID}=require('./contentPrivateConfigFixture.cjs');
const {fakeGoogle}=require('./contentDriveFixture.cjs');
const Campaign=require('../models/SocialCampaign'),Connection=require('../models/SocialConnection');
const publishing=require('../social/publishingService'),scheduling=require('../social/schedulingService');
const provider=require('../social/providers').getProvider('youtube');
let f,db,google,store,reader,owner,base,connection,options,fetchOriginal,tokenOriginal,providerOriginal,uploads=[];
const clone=x=>JSON.parse(JSON.stringify(x)),current=service.current;
const exact=d=>({expectedHash:current(d).hash,expectedRevision:d._drive.contentSha256});
before(async()=>{
 f=await require('./patternFixture.cjs')({mongoArgs:['--nounixsocket']});db=f.mongoose.connection.db;owner=f.founder.id;
 Object.assign(process.env,{ENTERPRISE_INTELLIGENCE_ENABLED:'true',ENTERPRISE_OWNER_USER_ID:owner,CONTENT_FACTORY_ENABLED:'true',CONTENT_FACTORY_START_DATE:'2026-11-07',SOCIAL_TOKEN_ENCRYPTION_KEY:'synthetic-only-fixture'});
 google=fakeGoogle(owner);store=createStore({db,owner,workspace:google.workspace,fetchImpl:google.fetchImpl});reader=await createMediaReader({owner,workspaceImpl:google.workspace,fetchImpl:google.fetchImpl});
 const workspace=require('../enterprise/content/workspaceConnection');tokenOriginal=workspace.getFreshAccessToken;workspace.getFreshAccessToken=google.workspace.getFreshAccessToken;
 fetchOriginal=global.fetch;global.fetch=(url,opts)=>String(url).startsWith('http://127.0.0.1:')?fetchOriginal(url,opts):google.fetchImpl(url,opts);
 f.app.use('/api/content-factory',require('../routes/contentFactoryRoutes'));f.app.use('/api/social-command',require('../routes/socialCommandRoutes'));f.app.use((e,_q,r,_n)=>r.status(e.statusCode||500).json({code:e.message}));
 connection=await Connection.create({userId:owner,provider:'youtube',providerAccountId:'synthetic_channel_a',accountName:'Synthetic test channel',accountType:'youtube_channel',scopes:provider.scopes,encryptedAccessToken:require('../social/tokenCrypto').encryptToken('synthetic-token')});
 options={connectionId:String(connection._id),providerAccountId:connection.providerAccountId,privacyStatus:'private',scheduledTime:null};
 providerOriginal={publishVideo:provider.publishVideo,getConnectedAccounts:provider.getConnectedAccounts};
 provider.getConnectedAccounts=async()=>[{providerAccountId:connection.providerAccountId}];
 provider.publishVideo=async input=>{uploads.push({bytes:Buffer.from(input.approvedMedia.buffer),post:clone(input.post)});return {id:'synthetic_video_'+uploads.length,url:'https://www.youtube.com/watch?v=synthetic_video_'+uploads.length};};
 await service.prepareDaily({db,store,now:new Date('2026-11-07T18:00:00Z')});let d=await store.get('first-longform');
 await service.approveImages({db,owner,id:d.itemId,...exact(d),store,mediaReader:reader,referenceSha256:google.files.get(ORIGINAL_LOGO_FILE_ID).meta.sha256Checksum,images:current(d).package.scenes.map((_,sceneIndex)=>({sceneIndex,fileId:'source_image_123456',sha256:google.files.get('source_image_123456').meta.sha256Checksum}))});
 d=await store.get(d.itemId);await service.attachReviewedMedia({db,owner,id:d.itemId,...exact(d),store,mediaReader:reader,media:{fileId:'review_video_123456',sha256:google.files.get('review_video_123456').meta.sha256Checksum,duration:current(d).package.duration},checks:Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true]))});
 d=await store.get(d.itemId);await service.approveMany({db,owner,store,mediaReader:reader,items:[{id:d.itemId,hash:current(d).hash,revision:d._drive.contentSha256,version:d.currentVersion}]});base=await store.get(d.itemId);
});
after(async()=>{global.fetch=fetchOriginal;require('../enterprise/content/workspaceConnection').getFreshAccessToken=tokenOriginal;Object.assign(provider,providerOriginal);await f?.close();});
async function source(id){const d=clone(base);delete d._drive;d._id=service.key(owner,id);d.itemId=id;return store.save({id,expectedHash:null,record:d});}
const preview=d=>release.previewRelease({db,owner,id:d.itemId,...exact(d),options,store,mediaReader:reader});
async function released(id,opts=options){const d=await source(id),p=await release.previewRelease({db,owner,id,...exact(d),options:opts,store,mediaReader:reader});const result=await release.releaseApproved({db,owner,id,...exact(d),options:opts,planHash:p.planHash,store,mediaReader:reader});return {d,p,result,campaign:await Campaign.findById(result.campaignId)};}
const publish=c=>publishing.publishPost({userId:owner,campaignId:c._id,postId:c.posts[0]._id});
test('preview is read-only; final approval alone creates no Social record or upload',async()=>{
 const d=await source('release-preview'),before=await db.collection('enterprisestates').findOne({_id:pointerKey(owner,d.itemId)}),n=google.calls.filter(c=>c.method==='POST').length;
 const p=await preview(d);assert.equal(p.execution,'NONE');assert.equal(p.privacyStatus,'private');assert.equal(p.upload.status.selfDeclaredMadeForKids,false);assert.equal(p.upload.snippet.categoryId,'27');
 assert.equal(google.calls.filter(c=>c.method==='POST').length,n);assert.deepEqual(await db.collection('enterprisestates').findOne({_id:before._id}),before);assert.equal(await Campaign.countDocuments(),0);assert.equal(uploads.length,0);
});
test('release creates one approved final record, normalized copy, private pointer, no schedule or upload; lost response retry is idempotent',async()=>{
 const x=await released('release-final');assert.equal(x.campaign.status,'approved');assert.equal(x.campaign.posts[0].publishStatus,'approved');assert.equal(x.campaign.scheduledAt,null);assert.equal(x.campaign.posts[0].mediaAssets[0].url,'');assert.equal(release.fingerprint(x.campaign.posts[0]),x.p.postHash);
 assert.deepEqual(require('../social/providers/youtubeProvider').buildYouTubeUploadRequest(x.campaign.posts[0]),x.p.upload);
 const again=await release.releaseApproved({db,owner,id:x.d.itemId,...exact(x.d),options,planHash:x.p.planHash,store,mediaReader:reader});assert.equal(again.campaignId,x.result.campaignId);assert.equal(await Campaign.countDocuments({_id:again.campaignId}),1);assert.equal(uploads.length,0);
 const ptr=await db.collection('enterprisestates').findOne({_id:pointerKey(owner,x.d.itemId)});assert(!JSON.stringify(ptr).includes(x.p.post.title));assert(!ptr.package&&!ptr.versions);
});
test('two concurrent explicit releases cannot create duplicate final campaigns',async()=>{
 const d=await source('release-race'),p=await preview(d),args={db,owner,id:d.itemId,...exact(d),options,planHash:p.planHash,store,mediaReader:reader};
 const results=await Promise.allSettled([release.releaseApproved(args),release.releaseApproved(args)]);assert(results.some(x=>x.status==='fulfilled'));assert.equal(await Campaign.countDocuments({'metadata.c0.itemId':d.itemId}),1);
});
test('release rejects stale hold, changed time/privacy/channel, unsupported platform, and other owner',async()=>{
 const d=await source('release-invalid'),p=await preview(d);
 for(const change of [{privacyStatus:'public'},{scheduledTime:'2099-01-01T12:00:00.000Z'},{providerAccountId:'other'}])await assert.rejects(release.releaseApproved({db,owner,id:d.itemId,...exact(d),options:{...options,...change},planHash:p.planHash,store,mediaReader:reader}),/C0_RELEASE_CHANGED|C0_RELEASE_CHANNEL_UNAVAILABLE/);
 await assert.rejects(release.previewRelease({db,owner:f.other.id,id:d.itemId,...exact(d),options,store,mediaReader:reader}),/C0_PUBLICATION_DISABLED/);
 await service.change({db,owner,id:d.itemId,...exact(d),action:'HOLD',store});await assert.rejects(release.releaseApproved({db,owner,id:d.itemId,...exact(d),options,planHash:p.planHash,store,mediaReader:reader}),/C0_APPROVAL_INVALIDATED|CONTENT_VERSION_CHANGED/);
 const facebook=await store.get('variant-b-facebook');await assert.rejects(preview(facebook),/C0_APPROVAL_INVALIDATED/);
});
test('HOLD invalidates an existing release; editing permits new review and preserves historical receipt',async()=>{
 const x=await released('release-hold'),d=await store.get(x.d.itemId);await service.change({db,owner,id:d.itemId,...exact(d),action:'EDIT',patch:{title:'What owns your attention today?'},store});
 const edited=await store.get(d.itemId);assert.equal(edited.release,null);assert.equal(edited.releaseHistory[0].releaseId,x.result.release.releaseId);assert.equal(edited.approval,null);
 await assert.rejects(publish(x.campaign),/C0_APPROVAL_INVALIDATED/);
 await service.attachReviewedMedia({db,owner,id:edited.itemId,...exact(edited),store,mediaReader:reader,media:{fileId:'review_video_123456',sha256:google.files.get('review_video_123456').meta.sha256Checksum,duration:current(edited).package.duration},checks:Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true]))});
 let renewed=await store.get(edited.itemId);await service.approveMany({db,owner,store,mediaReader:reader,items:[{id:renewed.itemId,hash:current(renewed).hash,revision:renewed._drive.contentSha256,version:renewed.currentVersion}]});
 renewed=await store.get(edited.itemId);const p=await preview(renewed),r=await release.releaseApproved({db,owner,id:renewed.itemId,...exact(renewed),options,planHash:p.planHash,store,mediaReader:reader});assert.notEqual(r.campaignId,x.result.campaignId);await assert.rejects(publish(x.campaign),/C0_APPROVAL_INVALIDATED/);
});
test('generic Social editing/approval cannot bypass C0 receipt; HTTP owner and input allowlists are enforced',async()=>{
 const x=await released('release-generic');const drafts=require('../social/driveCampaignDrafts').createCampaignDrafts({db,owner,store});
 await assert.rejects(drafts.edit(x.result.campaignId,'anything',null,x=>x),/C0_REVIEW_REQUIRED/);await assert.rejects(drafts.approve(x.result.campaignId,'anything'),/C0_REVIEW_REQUIRED/);
 assert.equal((await f.request(f.other,`/api/content-factory/${x.d.itemId}/release/preview`,'POST',{...exact(x.d),options})).status,404);
 assert.equal((await f.request(f.founder,`/api/content-factory/${x.d.itemId}/release/confirm`,'POST',{...exact(x.d),options,owner:'other'})).status,400);
 await assert.rejects(service.assertPublication({db,campaign:{userId:owner,metadata:{}},post:x.campaign.posts[0]}),/C0_LINKAGE_REQUIRED/);
});
test('changed bytes, changed source permission, oversize and mismatched live channel fail before upload',async()=>{
 const x=await released('release-media'),before=uploads.length,file=google.files.get('review_video_123456'),bytes=file.bytes;
 file.bytes=Buffer.from('tampered-bytes!!');await assert.rejects(publish(x.campaign),/C0_MEDIA_CHANGED|C0_RELEASE_MEDIA_TOO_LARGE/);file.bytes=bytes;
 const perms=file.meta.permissions;file.meta.permissions=[...perms,{type:'anyone',role:'reader'}];await assert.rejects(publish(x.campaign),/GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED/);file.meta.permissions=perms;
 const size=file.meta.size;file.meta.size=String(80*1024*1024);await assert.rejects(publish(x.campaign),/C0_RELEASE_MEDIA_TOO_LARGE/);file.meta.size=size;
 const getter=provider.getConnectedAccounts;provider.getConnectedAccounts=async()=>[{providerAccountId:'different_channel'}];await assert.rejects(publish(x.campaign),/C0_RELEASE_CHANNEL_CHANGED/);provider.getConnectedAccounts=getter;
 assert.equal(uploads.length,before);assert.equal((await Campaign.findById(x.result.campaignId)).posts[0].publishAttempts,0);
});
test('publication transfers exact private bytes once; duplicate clicks cannot publish twice',async()=>{
 const x=await released('release-publish'),before=uploads.length;
 const r=await Promise.allSettled([publish(x.campaign),publish(x.campaign)]);assert(r.some(v=>v.status==='fulfilled'));assert.equal(uploads.length,before+1);assert.deepEqual(uploads.at(-1).bytes,google.files.get('review_video_123456').bytes);
 const saved=await Campaign.findById(x.result.campaignId);assert.equal(saved.posts[0].publishAttempts,1);assert.equal(saved.posts[0].publishStatus,'published');assert.equal((await publish(saved)).skipped,true);assert.equal(uploads.length,before+1);
 assert.equal((await db.collection('enterprisestates').findOne({_id:pointerKey(owner,x.d.itemId)})).operationId,undefined);
});
test('HOLD racing during private transfer wins before the irreversible upload',async()=>{
 const x=await released('release-hold-race'),before=uploads.length;
 const wrapped={...reader,readExactVideo:async a=>{const bytes=await reader.readExactVideo(a),d=await store.get(x.d.itemId);await service.change({db,owner,id:d.itemId,...exact(d),action:'HOLD',store});return bytes;}};
 await assert.rejects(release.publishReleasedPost({db,campaign:x.campaign,post:x.campaign.posts[0],store,mediaReader:wrapped,provider,connection,accessToken:'test'}),/C0_APPROVAL_INVALIDATED/);assert.equal(uploads.length,before);
});
test('publication lock stops HOLD once upload begins, then releases only after confirmed success',async()=>{
 const x=await released('release-lock'),normal=provider.publishVideo;
 provider.publishVideo=async args=>{const d=await store.get(x.d.itemId);await assert.rejects(service.change({db,owner,id:d.itemId,...exact(d),action:'HOLD',store}),/CONTENT_VERSION_CHANGED/);return normal(args);};
 try{await publish(x.campaign);}finally{provider.publishVideo=normal;}
 assert.equal((await store.get(x.d.itemId)).status,'APPROVED');
});
test('uncertain YouTube upload is durably blocked from manual and scheduled retry',async()=>{
 const x=await released('release-uncertain'),normal=provider.publishVideo;let attempts=0;
 provider.publishVideo=async()=>{attempts++;throw Error('synthetic response lost after upload');};
 try{await assert.rejects(publish(x.campaign),/C0_PUBLICATION_INSPECTION_REQUIRED/);await assert.rejects(publish(await Campaign.findById(x.result.campaignId)),/C0_PUBLICATION_INSPECTION_REQUIRED/);}finally{provider.publishVideo=normal;}
 const saved=await Campaign.findById(x.result.campaignId);assert.equal(saved.posts[0].publishAttempts,1);assert.equal(saved.posts[0].publishStatus,'failed');assert.equal(saved.posts[0].nextPublishAttemptAt,null);assert.equal(attempts,1);
 assert.match((await db.collection('enterprisestates').findOne({_id:pointerKey(owner,x.d.itemId)})).operationId,/^publish:/);
 await db.collection('socialcampaigns').updateOne({_id:saved._id},{$set:{status:'scheduled','posts.0.scheduledTime':new Date('2020-01-01')}});assert.deepEqual(await scheduling.processDuePosts(),[]);
});
test('schedule activation is explicit, fixed to the approved not-before time; early publishing and alternate times are rejected',async()=>{
 const time='2099-02-01T12:00:00.000Z',x=await released('release-schedule',{...options,scheduledTime:time});
 await assert.rejects(publish(x.campaign),/C0_APPROVED_TIME_NOT_DUE/);
 await assert.rejects(scheduling.scheduleCampaignPosts({userId:owner,campaignId:x.campaign._id,postSchedules:[{postId:x.campaign.posts[0]._id,scheduledTime:'2099-02-01T13:00:00.000Z'}]}),/C0_EXACT_APPROVED_SCHEDULE_REQUIRED/);
 const scheduled=await scheduling.scheduleCampaignPosts({userId:owner,campaignId:x.campaign._id,postSchedules:[{postId:x.campaign.posts[0]._id,scheduledTime:time}]});assert.equal(scheduled.status,'scheduled');assert.equal(scheduled.posts[0].scheduledTime.toISOString(),time);
 assert.throws(()=>scheduling.activatePlannedSchedule(scheduled),/C0_EXPLICIT_SCHEDULE_REQUIRED/);
});
test('provider adapter uploads verified bytes without a public URL, native publishAt or HTTP retries',async()=>{
 const {google:g}=require('googleapis'),original=g.youtube;let called=0;
 g.youtube=()=>({videos:{insert:async(params,opts)=>{called++;assert.equal(opts.retry,false);assert.equal(params.requestBody.status.publishAt,undefined);const chunks=[];for await(const chunk of params.media.body)chunks.push(chunk);assert.equal(Buffer.concat(chunks).toString(),'approved-bytes');return {data:{id:'synthetic_adapter'}};}}});
 try{const result=await providerOriginal.publishVideo.call(provider,{accessToken:'synthetic-only',post:{title:'Test',description:'Approved',mediaAssets:[],scheduledTime:'2099-02-01T12:00:00.000Z',metadata:{privacyStatus:'private'}},approvedMedia:{buffer:Buffer.from('approved-bytes'),mimeType:'video/mp4'}});assert.equal(result.id,'synthetic_adapter');assert.equal(called,1);}finally{g.youtube=original;}
});

test('ambiguous final Mongo create and lost Drive receipt responses reconcile without duplicate records',async()=>{
 let d=await source('release-lost-mongo'),p=await preview(d),creates=0;
 const campaigns={findOne:q=>Campaign.findOne(q),create:async value=>{creates++;await Campaign.create(value);throw Error('synthetic lost final response');}};
 const args={db,owner,id:d.itemId,...exact(d),options,planHash:p.planHash,store,mediaReader:reader,campaigns};
 const first=await release.releaseApproved(args),again=await release.releaseApproved(args);assert.equal(first.campaignId,again.campaignId);assert.equal(creates,1);
 d=await source('release-lost-drive');p=await preview(d);let writes=0;
 const lostStore={...store,save:async args=>{writes++;await store.save(args);throw Error('synthetic lost Drive response');}};
 const second={db,owner,id:d.itemId,...exact(d),options,planHash:p.planHash,store:lostStore,mediaReader:reader};await assert.rejects(release.releaseApproved(second),/synthetic lost Drive response/);
 assert.equal(await Campaign.countDocuments({'metadata.c0.itemId':d.itemId}),0);await release.releaseApproved(second);assert.equal(writes,1);assert.equal(await Campaign.countDocuments({'metadata.c0.itemId':d.itemId}),1);
});
test('post tampering, owner role revocation and source grant loss block release/publication',async()=>{
 const x=await released('release-tamper'),tampered=clone(x.campaign);tampered.posts[0].title='Substituted title';
 await assert.rejects(release.assertReleasedPublication({db,campaign:tampered,post:tampered.posts[0],store}),/C0_APPROVAL_INVALIDATED/);
 const raw=clone(x.campaign);raw.posts[0].mediaAssets[0].metadata.sha256='0'.repeat(64);await assert.rejects(release.assertReleasedPublication({db,campaign:raw,post:raw.posts[0],store}),/C0_APPROVAL_INVALIDATED/);
 await db.collection('users').updateOne({_id:new f.mongoose.Types.ObjectId(owner)},{$set:{role:'USER'}});try{await assert.rejects(publish(x.campaign),/C0_PUBLICATION_DISABLED/);}finally{await db.collection('users').updateOne({_id:new f.mongoose.Types.ObjectId(owner)},{$set:{role:'COMMANDER_IN_CHIEF'}});}
 await assert.rejects(createMediaReader({owner,workspaceImpl:{getFreshAccessToken:async()=>({accessToken:'synthetic',connection:{userId:owner,status:'connected',accountEmail:require('./contentPrivateConfigFixture.cjs').BUSINESS_ACCOUNT,scopes:[]}})},fetchImpl:google.fetchImpl}),/DRIVE_DRAFT_AUTH_REQUIRED/);
});
