const {enabled,ownerId}=require('../policy');
const {catalog,calendar,subtitles,regenerate}=require('./catalog');
const {CONTRACT,VOICES,validateFeedback}=require('./voice');
const {VISUAL_REVIEW}=require('./visual');
const {qa,hash}=require('./qa');
const {createStore}=require('./driveDraftStore');
const {createMediaReader,ORIGINAL_LOGO_FILE_ID}=require('./driveMedia');
const driveVisual=require('./driveVisual');
const COLLECTION='enterprisestates';
const fail=(code,statusCode=400)=>{throw Object.assign(new Error(code),{statusCode});};
const key=(owner,id)=>`c0:item:${owner}:${id}`;
const json=value=>JSON.parse(JSON.stringify(value));
const dayKey=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const current=doc=>doc.versions.find(v=>v.number===doc.currentVersion);
const storeFor=({db,owner,store})=>store||createStore({db,owner});
function active(env=process.env){return enabled(env)&&env.CONTENT_FACTORY_ENABLED==='true';}
async function documentFor({db,owner,id,store}){return await store.get(id)||await db.collection(COLLECTION).findOne({_id:key(owner,id),owner});}
function exact(doc,expectedHash,expectedRevision){
 if(!doc)fail('NOT_FOUND',404);
 if(current(doc).hash!==expectedHash||doc._drive&&doc._drive.contentSha256!==expectedRevision)fail('CONTENT_VERSION_CHANGED',409);
}
async function saveRecord(store,previous,record){return store.save({id:record.itemId,expectedHash:previous?._drive?current(previous).hash:null,expectedContentSha256:previous?._drive?.contentSha256||null,record});}
async function voiceState(db,owner,{store}={}){
 const legacy=await db.collection(COLLECTION).findOne({_id:'c0:voice:'+owner,owner})||{version:1,rules:[]};
 if(!store)return legacy;
 const docs=await store.list();const rules=docs.filter(d=>d.kind==='C0_ITEM').flatMap(d=>d.feedback||[]).sort((a,b)=>new Date(a.at)-new Date(b.at));
 return {version:legacy.version+rules.length,rules:[...legacy.rules,...rules].slice(-100)};
}
async function prepareDaily({db,env=process.env,now=new Date(),store}){
 if(!active(env))return {status:'OFF'};
 const owner=ownerId(env),{ObjectId}=require('mongoose').mongo;
 if(!await db.collection('users').findOne({_id:new ObjectId(owner),role:'COMMANDER_IN_CHIEF'},{projection:{_id:1}}))return {status:'OWNER_UNAVAILABLE'};
 if(!env.CONTENT_FACTORY_START_DATE)return {status:'START_DATE_REQUIRED',created:0};
 const today=dayKey(now),day=Math.floor((Date.parse(today)-Date.parse(env.CONTENT_FACTORY_START_DATE))/86400000)+1;
 if(!Number.isFinite(day)||day<1||day>calendar().length)return {status:'CALENDAR_COMPLETE_OR_NOT_STARTED',created:0};
 const storage=storeFor({db,owner,store}),learned=await voiceState(db,owner,{store:storage});let created=0;
 for(const item of catalog().filter(x=>x.package.day<=Math.min(day+2,calendar().length))){
  if(await documentFor({db,owner,id:item.id,store:storage}))continue;
  const p=driveVisual.pendingImages(regenerate(item.package,learned.rules));
  const record={_id:key(owner,item.id),kind:'C0_ITEM',owner,itemId:item.id,currentVersion:1,versions:[{number:1,hash:hash(p),package:p,createdAt:now}],status:'DRAFT',approval:null,createdAt:now,updatedAt:now};
  await saveRecord(storage,null,record);created++;
 }
 return {status:'OK',created,day,bufferThroughDay:Math.min(day+2,calendar().length),storage:'GOOGLE_DRIVE',imageApprovalRequired:true};
}
function startDaily({connection,env=process.env}){
 if(!active(env))return()=>{};
 let running=false;const tick=async()=>{if(running||connection.readyState!==1)return;running=true;try{await prepareDaily({db:connection.db,env});}catch(e){console.warn('[content-factory] Drive preparation blocked: '+e.message);}finally{running=false;}};
 const first=setTimeout(tick,35000),timer=setInterval(tick,15*60*1000);first.unref();timer.unref();return()=>{clearTimeout(first);clearInterval(timer);};
}
async function list(db,owner,{store}={}){
 const storage=storeFor({db,owner,store});let drive=[],storageError=null;
 try{drive=await storage.list();}catch(e){storageError=e.message;}
 const legacy=await db.collection(COLLECTION).find({kind:'C0_ITEM',owner}).sort({updatedAt:-1,itemId:1}).limit(100).toArray();
 const merged=new Map(legacy.map(d=>[d.itemId,d]));drive.filter(d=>d.kind==='C0_ITEM').forEach(d=>merged.set(d.itemId,d));
 let learned=await voiceState(db,owner);const newRules=drive.filter(d=>d.kind==='C0_ITEM').flatMap(d=>d.feedback||[]).sort((a,b)=>new Date(a.at)-new Date(b.at));learned={version:learned.version+newRules.length,rules:[...learned.rules,...newRules].slice(-100)};
 const items=[...merged.values()].map(d=>({id:d.itemId,version:d.currentVersion,hash:current(d).hash,revision:d._drive?.contentSha256||null,status:d.status,approval:d.approval,socialCampaignId:d.socialCampaignId||null,assembly:d.assembly||null,storage:d._drive?{provider:'GOOGLE_DRIVE',fileId:d._drive.fileId}:{provider:'LEGACY_MONGODB',readOnly:true},package:current(d).package,qa:qa(current(d).package,learned.rules),history:d.versions.map(v=>({version:v.number,hash:v.hash,createdAt:v.createdAt}))}));
 items.sort((a,b)=>new Date(b.history.at(-1)?.createdAt||0)-new Date(a.history.at(-1)?.createdAt||0));
 const enterprise=await db.collection(COLLECTION).findOne({_id:'freedom-audit:'+owner,owner},{projection:{'brief.findings':1,'brief.revenue':1,lastSuccessAt:1}});
 return {items,visual:driveVisual.CONTRACT,voice:{...CONTRACT,feedbackVersion:learned.version,learned:learned.rules},calendar:calendar(),daily:null,storage:{provider:'GOOGLE_DRIVE',exclusiveDrafts:true,error:storageError,legacyPreserved:true},reviewBatch:{name:'Drive approval drafts',status:storageError?'BLOCKED':'READY',itemCount:items.filter(i=>i.storage.provider==='GOOGLE_DRIVE').length,items:[],longform:'FOUNDER_REVIEW_REQUIRED'},performance:{observedAt:enterprise?.lastSuccessAt||null,revenue:enterprise?.brief?.revenue||null,findings:enterprise?.brief?.findings||[],coverage:'Per-content conversion attribution remains unverified.',recommendation:'Measure qualified attention and attributable outcomes before changing the content mix.'},production:{googleVidsAssembly:'INTERACTIVE_UI_REQUIRED',googleDriveDownload:'EXISTING_ADAPTER_ONLY; complete export pipeline pending',externalSpend:0,continuous:'Bounded seven-day prepared catalog while the server is awake. A rolling daily long-form schedule is not implemented.',generation:'No image/video generation is invoked. Select approved Drive images before video production.'}};
}
function validatePatch(patch){const allowed=['voice','intensity','title','description','cta','scenes','destination','hashtags','keywords','distribution','pinnedComment','approvalExceptions'];if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!allowed.includes(k)))fail('INVALID_CONTENT_PATCH');if(JSON.stringify(patch).length>60000)fail('CONTENT_TOO_LARGE');}
function validatePackage(p){if(!VOICES.includes(p.voice)||![0,1,2].includes(p.intensity))fail('INVALID_LINEAGE_VOICE');if(typeof p.title!=='string'||p.title.length>160||typeof p.description!=='string'||p.description.length>5000||typeof p.cta!=='string'||p.cta.length>300)fail('INVALID_COPY');if(!Array.isArray(p.scenes)||p.scenes.length>60||p.scenes.some(s=>typeof s.narration!=='string'||typeof s.screen!=='string'||s.narration.length>12000||s.screen.length>1000||!Number.isFinite(s.start)||!Number.isFinite(s.end)))fail('INVALID_SCENES');for(const k of ['hashtags','keywords','approvalExceptions'])if(!Array.isArray(p[k])||p[k].length>30||p[k].some(s=>typeof s!=='string'||s.length>100))fail('INVALID_METADATA');if(p.destination?.url){let u;try{u=new URL(p.destination.url);}catch{fail('INVALID_DESTINATION');}if(u.protocol!=='https:'||u.hostname!=='freedom.toisouljahacademy.com')fail('UNAPPROVED_DESTINATION');}if(p.distribution?.connectionId&&!/^[a-f0-9]{24}$/.test(p.distribution.connectionId))fail('INVALID_CONNECTION');if(p.distribution?.scheduledTime&&!Number.isFinite(Date.parse(p.distribution.scheduledTime)))fail('INVALID_SCHEDULE');}
async function change({db,owner,id,expectedHash,expectedRevision,action,patch,feedback,store}){
 if(!['EDIT','REGENERATE','HOLD','REJECT','FEEDBACK'].includes(action))fail('INVALID_ACTION');
 if((feedback&&!validateFeedback(feedback))||(action==='FEEDBACK'&&!feedback))fail('INVALID_FEEDBACK');
 if(action==='REGENERATE')fail('FOUNDER_IMAGE_DIRECTION_REQUIRED',409);
 const storage=storeFor({db,owner,store}),doc=await documentFor({db,owner,id,store:storage});exact(doc,expectedHash,expectedRevision);
 const record=json(doc),old=current(doc);delete record._drive;
 if(action==='EDIT'){
  validatePatch(patch);const p={...json(old.package),...json(patch)};p.script=p.scenes.map(s=>s.narration).filter(Boolean).join('\n\n');p.subtitles=subtitles(p.scenes);
  p.production={...p.production,media:null,review:null,status:'VIDEO_REVIEW_REQUIRED'};
  // Changing the scene list invalidates its image-to-scene binding.
  if(patch.scenes)driveVisual.pendingImages(p);
  validatePackage(p);if(record.versions.length>=20)fail('VERSION_LIMIT_REACHED',409);
  record.currentVersion++;record.versions.push({number:record.currentVersion,hash:hash(p),package:p,createdAt:new Date()});record.assembly=null;
 }
 record.status=action==='HOLD'?'HOLD':action==='REJECT'?'REJECTED':action==='FEEDBACK'&&doc.status!=='APPROVED'?doc.status:'DRAFT';
 record.approval=null;record.updatedAt=new Date();
 if(feedback)record.feedback=[...(record.feedback||[]),{...feedback,voice:feedback.voice||old.package.voice,action,at:new Date()}].slice(-100);
 const result=await saveRecord(storage,doc,record);
 return {changed:true,approvalInvalidated:true,execution:'NONE',storage:'GOOGLE_DRIVE',revision:result._drive.contentSha256};
}
const REVIEW_CHECKS=['rendered_media','mobile_readability','audio_continuity','dead_air','unwanted_speech','blank_frames','transitions','subtitle_alignment','message_accuracy',...VISUAL_REVIEW];
const OCTOBER_1_MEDIA_PROOFS=[
 {id:'organic-d01-discovery-important',decision:'COMBINE',technicalQa:'PASS',media:{url:'https://www.toisouljahacademy.com/assets/content-factory/organic-d01-discovery-important.mp4',sha256:'dd792a26d11855381d92b42ede1aae7e70870a39fc68370cbee82c49fd9451f5',duration:40}},
 {id:'organic-d01-teaching-capacity',decision:'COMBINE',technicalQa:'PASS',media:{url:'https://www.toisouljahacademy.com/assets/content-factory/organic-d01-teaching-capacity.mp4',sha256:'f6476f04b1af390662be8ab0685d0f1323a4cd514cfa437beedcc7c8a174db1a',duration:40}},
 {id:'organic-d01-pattern-wrong-problem',decision:'COMBINE',technicalQa:'PASS',media:{url:'https://www.toisouljahacademy.com/assets/content-factory/organic-d01-pattern-wrong-problem.mp4',sha256:'5f2d0c63cd88fef122fad3b0398d416d87f7d993d8d17faefdcd579bf1415a9c',duration:40}}
];
// Historical hardcoded proofs are retained as references, never recreated or auto-approved.
async function materializeFounderReview(){return {status:'FOUNDER_IMAGE_APPROVAL_REQUIRED',reviewItemCount:0,items:[],execution:'NONE',publicContentPublished:'NO',publicContentScheduled:'NO'};}
async function approveImages({db,owner,id,expectedHash,expectedRevision,images,referenceSha256,store,mediaReader}){
 const storage=storeFor({db,owner,store}),doc=await documentFor({db,owner,id,store:storage});exact(doc,expectedHash,expectedRevision);
 if(['HOLD','REJECTED','APPROVED'].includes(doc.status))fail('CONTENT_NOT_APPROVABLE',409);
 const old=current(doc),p=driveVisual.pendingImages(json(old.package));
 if(!/^[a-f0-9]{64}$/.test(referenceSha256||'')||!Array.isArray(images)||images.length!==p.scenes.length||images.some((x,i)=>x.sceneIndex!==i||typeof x.fileId!=='string'||!/^[a-f0-9]{64}$/.test(x.sha256||'')))fail('EXACT_SCENE_IMAGES_REQUIRED');
 const reader=mediaReader||await createMediaReader({owner}),reference=await reader.inspect(ORIGINAL_LOGO_FILE_ID,'image'),selected=[];
 if(reference.sha256!==referenceSha256)fail('APPROVED_IMAGE_CHANGED',409);
 for(const image of images){const verified=await reader.inspect(image.fileId,'image');if(verified.sha256!==image.sha256)fail('APPROVED_IMAGE_CHANGED',409);selected.push({...verified,sceneIndex:image.sceneIndex});}
 const selection={reference,images:selected},selectionHash=driveVisual.selectionHash(selection);
 p.visual={...driveVisual.CONTRACT,status:'FOUNDER_IMAGES_APPROVED',reference};
 p.scenes=p.scenes.map((scene,i)=>({...scene,visual:{fileId:selected[i].fileId,sha256:selected[i].sha256,url:selected[i].url}}));
 if(p.cover)delete p.cover.svg;
 p.production={...p.production,status:'VIDEO_PRODUCTION_READY',imageApproval:{...selection,selectionHash,approvedBy:owner,approvedAt:new Date().toISOString()},media:null,review:null};
 const record=json(doc);delete record._drive;if(record.versions.length>=20)fail('VERSION_LIMIT_REACHED',409);
 record.currentVersion++;record.versions.push({number:record.currentVersion,hash:hash(p),package:p,createdAt:new Date()});record.status='DRAFT';record.approval=null;record.assembly=null;record.updatedAt=new Date();
 await saveRecord(storage,doc,record);return {approvedImages:true,videoApproval:false,execution:'NONE'};
}
async function assertSelectedImages(p,reader){
 const approval=p.production?.imageApproval;if(!approval||approval.selectionHash!==driveVisual.selectionHash(approval))fail('FOUNDER_IMAGE_APPROVAL_REQUIRED',409);
 const reference=await reader.inspect(approval.reference.fileId,'image');if(reference.sha256!==approval.reference.sha256)fail('APPROVED_IMAGE_CHANGED',409);
 for(const image of approval.images){if((await reader.inspect(image.fileId,'image')).sha256!==image.sha256)fail('APPROVED_IMAGE_CHANGED',409);}
}
async function assembleApprovedImages({db,owner,id,expectedHash,expectedRevision,store,mediaReader,assembler,workspaceImpl,fetchImpl}){
 const storage=storeFor({db,owner,store});let doc=await storage.get(id);exact(doc,expectedHash,expectedRevision);
 if(!['DRAFT','FOUNDER_REVIEW'].includes(doc.status))fail('CONTENT_NOT_APPROVABLE',409);
 const p=current(doc).package,reader=mediaReader||await createMediaReader({owner});await assertSelectedImages(p,reader);
 let job=doc.assembly,allowCreate=false;
 if(job&&job.sourceHash===expectedHash&&job.selectionHash===p.production.imageApproval.selectionHash){
  // Only a prior, confirmed no-upload preflight failure may start a new attempt.
  if(job.status==='BLOCKED_PRE_UPLOAD'){job={...job,status:'PREPARING'};doc=await saveRecord(storage,doc,{...json(doc),assembly:job,updatedAt:new Date()});allowCreate=true;}
 }else{
  job={operationId:require('node:crypto').randomUUID(),sourceHash:expectedHash,selectionHash:p.production.imageApproval.selectionHash,status:'PREPARING',startedAt:new Date().toISOString()};
  doc=await saveRecord(storage,doc,{...json(doc),assembly:job,updatedAt:new Date()});allowCreate=true;
 }
 const create=assembler||require('./approvedSlides').createApprovedSlides;
 let artifact;
 try{artifact=await create({owner,itemId:id,package:p,expectedHash,operationId:job.operationId,allowCreate,workspaceImpl,mediaReader:reader,fetchImpl});}
 catch(error){
  if(allowCreate&&error.uploadAttempted===false&&error.outcomeUnknown===false){
   try{await saveRecord(storage,doc,{...json(doc),assembly:{...job,status:'BLOCKED_PRE_UPLOAD',error:error.message},updatedAt:new Date()});}catch{/* A failed state write stays conservative: lookup-only recovery. */}
  }
  // An ambiguous Google upload is never repeated automatically. The same operation
  // can be inspected again; source/review content remains only in Drive.
  throw Object.assign(new Error(error.statusCode?error.message:'GOOGLE_SLIDES_ASSEMBLY_UNCONFIRMED'),{statusCode:error.statusCode||503});
 }
 const latest=await storage.get(id);
 if(latest?._drive.contentSha256!==doc._drive.contentSha256||latest.assembly?.operationId!==job.operationId)fail('CONTENT_VERSION_CHANGED',409);
 if(job.status==='READY')return {assembly:{...job,artifact},execution:'NONE',reused:true};
 const ready={...job,status:'READY',artifact,completedAt:new Date().toISOString(),visualReview:'FOUNDER_REVIEW_REQUIRED'};
 await saveRecord(storage,latest,{...json(latest),assembly:ready,updatedAt:new Date()});
 return {assembly:ready,execution:'PRIVATE_DRIVE_SLIDES_ONLY',finalApproval:false};
}
async function attachReviewedMedia({db,owner,id,expectedHash,expectedRevision,media,checks,store,mediaReader}){
 if(!media||typeof media.fileId!=='string'||!/^[a-f0-9]{64}$/.test(media.sha256||'')||!Number.isFinite(media.duration)||media.duration<=0||REVIEW_CHECKS.some(k=>checks?.[k]!==true)||Object.keys(checks).some(k=>!REVIEW_CHECKS.includes(k)))fail('EXACT_MEDIA_AND_REVIEW_REQUIRED');
 const storage=storeFor({db,owner,store}),doc=await documentFor({db,owner,id,store:storage});exact(doc,expectedHash,expectedRevision);
 if(['HOLD','REJECTED','APPROVED'].includes(doc.status))fail('CONTENT_NOT_APPROVABLE',409);
 const p=json(current(doc).package),reader=mediaReader||await createMediaReader({owner});await assertSelectedImages(p,reader);
 const verified=await reader.inspect(media.fileId,'video');if(verified.sha256!==media.sha256)fail('C0_MEDIA_CHANGED',409);if(Math.abs(p.duration-media.duration)>2)fail('MEDIA_DURATION_MISMATCH');
 p.production={...p.production,status:'FOUNDER_REVIEW',media:{...verified,duration:media.duration},review:{method:'FOUNDER_ATTESTATION',by:owner,at:new Date().toISOString(),checks},storage:{provider:'GOOGLE_DRIVE',approvalDraft:true}};
 const record=json(doc);delete record._drive;if(record.versions.length>=20)fail('VERSION_LIMIT_REACHED',409);
 record.currentVersion++;record.versions.push({number:record.currentVersion,hash:hash(p),package:p,createdAt:new Date()});record.status='FOUNDER_REVIEW';record.approval=null;record.updatedAt=new Date();
 await saveRecord(storage,doc,record);return {recorded:true,method:'FOUNDER_ATTESTATION',approvalInvalidated:true};
}
const postFingerprint=post=>hash({provider:post.provider,format:post.format,connectedAccountId:String(post.connectedAccountId||''),title:post.title,caption:post.caption,description:post.description,hashtags:[...(post.hashtags||[])],link:post.link,mediaAssets:(post.mediaAssets||[]).map(a=>({url:a.url,type:a.type})),scheduledTime:post.scheduledTime?new Date(post.scheduledTime).toISOString():null,metadata:json(post.metadata||{})});
async function approveMany({db,owner,items,store,mediaReader}){
 if(!Array.isArray(items)||items.length!==1)fail('APPROVE_ONE_EXACT_DRIVE_VERSION');
 const item=items[0];if(!item||typeof item.id!=='string'||typeof item.hash!=='string'||typeof item.revision!=='string'||!Number.isInteger(item.version))fail('EXACT_VERSIONS_REQUIRED');
 const storage=storeFor({db,owner,store}),doc=await storage.get(item.id);exact(doc,item.hash,item.revision);
 if(doc.currentVersion!==item.version)fail('CONTENT_VERSION_CHANGED',409);
 if(!['DRAFT','FOUNDER_REVIEW'].includes(doc.status))fail('CONTENT_NOT_APPROVABLE',409);
 const p=current(doc).package,learned=await voiceState(db,owner,{store:storage});if(!qa(p,learned.rules).canApprove)fail('QA_NOT_PASSED',409);
 const reader=mediaReader||await createMediaReader({owner});await assertSelectedImages(p,reader);
 if((await reader.inspect(p.production.media.fileId,'video')).sha256!==p.production.media.sha256)fail('C0_MEDIA_CHANGED',409);
 const record=json(doc);delete record._drive;record.status='APPROVED';record.approval={hash:item.hash,version:item.version,approvedBy:owner,approvedAt:new Date(),scope:'EXACT_DRIVE_MEDIA_APPROVAL'};record.updatedAt=new Date();
 await saveRecord(storage,doc,record);
 return {approved:[{id:item.id}],execution:'NONE',handoff:'Approved in Drive. Publishing adapter is not ready; no Social draft or public copy was created.'};
}
async function assertPublication({db,campaign,post,env=process.env}){
 const receipt=campaign.metadata?.c0;if(!receipt)return;
 const owner=String(campaign.userId);if(!active(env)||owner!==ownerId(env))fail('C0_PUBLICATION_DISABLED',409);
 // Preserve existing final approvals; new Drive approvals cannot pass this legacy publishing path.
 const superseding=await db.collection(COLLECTION).findOne({_id:require('./driveDraftStore').pointerKey(owner,receipt.itemId),owner,kind:'C0_DRIVE_DRAFT_POINTER',driveFileId:{$exists:true}});if(superseding)fail('C0_APPROVAL_INVALIDATED',409);
 const doc=await db.collection(COLLECTION).findOne({_id:key(owner,receipt.itemId),owner});
 if(!doc||doc.status!=='APPROVED'||doc.approval?.hash!==receipt.hash||current(doc).hash!==receipt.hash||postFingerprint(post)!==receipt.postHash)fail('C0_APPROVAL_INVALIDATED',409);
 const learned=await voiceState(db,owner,{store:storeFor({db,owner})});if(!qa(current(doc).package,learned.rules,{legacyApproved:true}).canApprove)fail('C0_QA_CHANGED',409);
}
module.exports={active,prepareDaily,startDaily,list,change,approveImages,assembleApprovedImages,attachReviewedMedia,materializeFounderReview,approveMany,assertPublication,postFingerprint,current,key,voiceState,REVIEW_CHECKS,OCTOBER_1_MEDIA_PROOFS};
