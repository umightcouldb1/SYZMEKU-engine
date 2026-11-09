'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const service=require('../enterprise/content/service'),{createStore}=require('../enterprise/content/driveDraftStore'),{createMediaReader}=require('../enterprise/content/driveMedia');
const {fakeGoogle}=require('./contentDriveFixture.cjs');
let f,db,google,store,reader,source,originalFetch,oldTokenGetter;
const now=new Date('2026-11-07T18:00:00Z'),sourceId='google_vids_source_123456',operationName='opaque_export_123456',outputId='review_video_123456';
const clone=value=>JSON.parse(JSON.stringify(value));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function receipt(args){const fields={kind:'C0_VIDS_SOURCE_VERSION_V1',owner:args.owner,itemId:args.itemId,operationId:args.operationId,sourceHash:args.expectedHash,fileId:args.vidsFileId,version:'17',modifiedTime:now.toISOString()};return {...fields,receiptHash:sha(JSON.stringify(fields))};}
const result=(input,status='GOOGLE_VIDS_EXPORT_PENDING')=>({operationId:input.operationId,sourceHash:input.expectedHash,sourceReceipt:input.sourceReceipt,operationName,status,startAttempted:!input.operationName&&input.allowCreate,uploadAttempted:status==='VIDEO_DRAFT_SAVED',
 ...(status==='VIDEO_DRAFT_SAVED'?{fileId:outputId,mimeType:'video/mp4',size:15,sha256:'a'.repeat(64),url:'https://evil.invalid/ignored?TOKEN=PRIVATE'}:{})});
function adapter(exporter){const calls=[];return {calls,inspectPrivateVids:async args=>receipt(args),exportPrivateVids:async args=>{calls.push(args);return exporter?exporter(args):result(args);}};}
async function make(id){const record=clone(source);delete record._drive;record._id=service.key(f.founder.id,id);record.itemId=id;record.vidsExport=null;record.status='DRAFT';record.approval=null;return store.save({id,expectedHash:null,record});}
function args(doc,vidsAdapter,extra={}){return {db,owner:f.founder.id,id:doc.itemId,expectedHash:service.current(doc).hash,expectedRevision:doc._drive.contentSha256,action:'START',vidsFileId:sourceId,store,mediaReader:reader,vidsAdapter,now,...extra};}
const checkArgs=(doc,a,extra={})=>args(doc,a,{action:'CHECK',vidsFileId:undefined,now:new Date(now.getTime()+11000),...extra});
before(async()=>{
 f=await require('./patternFixture.cjs')({mongoArgs:['--nounixsocket']});db=f.mongoose.connection.db;
 Object.assign(process.env,{ENTERPRISE_INTELLIGENCE_ENABLED:'true',ENTERPRISE_OWNER_USER_ID:f.founder.id,CONTENT_FACTORY_ENABLED:'true',CONTENT_FACTORY_START_DATE:'2026-11-07'});
 google=fakeGoogle(f.founder.id);store=createStore({db,owner:f.founder.id,workspace:google.workspace,fetchImpl:google.fetchImpl});
 reader=await createMediaReader({owner:f.founder.id,workspaceImpl:google.workspace,fetchImpl:google.fetchImpl});
 await service.prepareDaily({db,store,now});let base=await store.get('variant-b-facebook');
 await service.approveImages({db,owner:f.founder.id,id:base.itemId,expectedHash:service.current(base).hash,expectedRevision:base._drive.contentSha256,store,mediaReader:reader,
  referenceSha256:google.files.get(require('./contentPrivateConfigFixture.cjs').ORIGINAL_LOGO_FILE_ID).meta.sha256Checksum,
  images:service.current(base).package.scenes.map((_,sceneIndex)=>({sceneIndex,fileId:'source_image_123456',sha256:google.files.get('source_image_123456').meta.sha256Checksum}))});
 source=await store.get(base.itemId);
 const workspace=require('../enterprise/content/workspaceConnection');oldTokenGetter=workspace.getFreshAccessToken;workspace.getFreshAccessToken=google.workspace.getFreshAccessToken;
 originalFetch=global.fetch;global.fetch=(url,options)=>String(url).startsWith('https://www.googleapis.com/')?google.fetchImpl(url,options):originalFetch(url,options);
 f.app.use('/api/content-factory',require('../routes/contentFactoryRoutes'));f.app.use((e,_req,res,_next)=>res.status(e.statusCode||(res.statusCode>=400?res.statusCode:500)).json({code:e.message}));
});
after(async()=>{global.fetch=originalFetch;require('../enterprise/content/workspaceConnection').getFreshAccessToken=oldTokenGetter;await f?.close();});

test('Vids start persists source receipt and CAS attempt before adapter and keeps approval separate',async()=>{
 const doc=await make('vids-start');const a=adapter(async input=>{
  const locked=await store.get(doc.itemId);assert.equal(locked.vidsExport.status,'ATTEMPTING');assert(locked.vidsExport.attemptId);
  assert.equal(locked.vidsExport.sourceReceipt.receiptHash,input.sourceReceipt.receiptHash);assert.equal(input.allowCreate,true);assert.equal(input.reconcileOnly,false);
  assert.equal(locked.vidsExport.sourceHash,service.current(locked).hash);return result(input);
 });
 const exported=await service.exportVidsDraft(args(doc,a));assert.equal(exported.vidsExport.status,'PENDING');assert.equal(exported.finalApproval,false);
 const saved=await store.get(doc.itemId);assert.equal(saved.vidsExport.operationName,operationName);assert.equal(service.current(saved).hash,service.current(doc).hash);
 assert.notEqual(saved._drive.contentSha256,doc._drive.contentSha256);assert.equal(service.current(saved).package.production.media,null);assert.equal(saved.approval,null);
 assert.equal(await db.collection('enterprisestates').countDocuments({kind:'C0_ITEM',itemId:doc.itemId}),0);
});

test('duplicate starts and read-only queue refresh never execute another export',async()=>{
 const doc=await make('vids-duplicate'),a=adapter();await service.exportVidsDraft(args(doc,a));
 await assert.rejects(service.exportVidsDraft(args(doc,a)),/CONTENT_VERSION_CHANGED/);
 const saved=await store.get(doc.itemId);await assert.rejects(service.exportVidsDraft(args(saved,a)),/GOOGLE_VIDS_JOB_EXISTS/);
 const data=await service.list(db,f.founder.id,{store});assert.equal(data.items.find(i=>i.id===doc.itemId).vidsExport.status,'PENDING');assert.equal(a.calls.length,1);
});

test('pending checks respect backoff and a later explicit check creates a new durable attempt',async()=>{
 const doc=await make('vids-pending'),a=adapter();await service.exportVidsDraft(args(doc,a));const pending=await store.get(doc.itemId);
 const early=await service.exportVidsDraft(checkArgs(pending,a,{now}));assert.equal(early.reused,true);assert.equal(a.calls.length,1);
 assert.equal((await store.get(doc.itemId))._drive.contentSha256,pending._drive.contentSha256);
 a.exportPrivateVids=async input=>{a.calls.push(input);const locked=await store.get(doc.itemId);assert.notEqual(locked.vidsExport.attemptId,pending.vidsExport.attemptId);assert.equal(input.allowCreate,true);assert.equal(input.operationName,operationName);return result(input,'VIDEO_DRAFT_SAVED');};
 const ready=await service.exportVidsDraft(checkArgs(pending,a));assert.equal(ready.vidsExport.status,'READY');assert.equal(ready.finalApproval,false);
 assert.equal(ready.vidsExport.artifact.url,`https://drive.google.com/file/d/${outputId}/view`);assert(!JSON.stringify(ready).includes('TOKEN='));
 const saved=await store.get(doc.itemId);assert.equal(service.current(saved).package.production.media,null);assert.equal(saved.approval,null);assert.equal(saved.status,'DRAFT');
 a.exportPrivateVids=async input=>{assert.equal(input.allowCreate,false);assert.equal(input.reconcileOnly,true);return result(input,'VIDEO_DRAFT_SAVED');};
 await service.exportVidsDraft(checkArgs(saved,a));assert.equal(await db.collection('socialcampaigns').countDocuments({}),0);assert.equal(await db.collection('tasks').countDocuments({}),0);
});

for(const knowsName of [false,true])test(`uncertain start/upload (${knowsName?'known':'lost'} operation name) permits lookup only`,async()=>{
 const doc=await make('vids-unknown-'+knowsName),a=adapter(input=>{throw Object.assign(new Error('GOOGLE_VIDS_REQUEST_FAILED'),{statusCode:502,startAttempted:true,uploadAttempted:knowsName,outcomeUnknown:true,...(knowsName?{operationName}:{})});});
 await assert.rejects(service.exportVidsDraft(args(doc,a)),/GOOGLE_VIDS_REQUEST_FAILED/);const unknown=await store.get(doc.itemId);assert.equal(unknown.vidsExport.status,'UNCERTAIN');
 a.exportPrivateVids=async input=>{a.calls.push(input);assert.equal(input.allowCreate,false);assert.equal(input.reconcileOnly,true);assert.equal(input.operationId,unknown.vidsExport.operationId);throw Error('GOOGLE_VIDS_OUTCOME_UNCERTAIN');};
 await assert.rejects(service.exportVidsDraft(checkArgs(unknown,a)),/OUTCOME_UNCERTAIN/);assert.deepEqual(a.calls.map(c=>c.allowCreate),[true,false]);
 await assert.rejects(service.exportVidsDraft(args(await store.get(doc.itemId),a)),/JOB_EXISTS/);
});

test('ambiguous final Drive receipt save recovers nameless output with lookup only',async()=>{
 const doc=await make('vids-lost-receipt'),a=adapter(input=>result(input,'VIDEO_DRAFT_SAVED'));
 const interrupted={...store,save:async input=>{if(input.record.vidsExport?.status==='READY')throw Error('SYNTHETIC_LOST_DRIVE_RECEIPT');return store.save(input);}};
 await assert.rejects(service.exportVidsDraft(args(doc,a,{store:interrupted})),/LOST_DRIVE_RECEIPT/);
 const locked=await store.get(doc.itemId);assert.equal(locked.vidsExport.status,'ATTEMPTING');assert.equal(locked.vidsExport.operationName,undefined);
 a.exportPrivateVids=async input=>{assert.equal(input.allowCreate,false);assert.equal(input.reconcileOnly,true);const found=result(input,'VIDEO_DRAFT_SAVED');delete found.operationName;return found;};
 const saved=await service.exportVidsDraft(checkArgs(locked,a));assert.equal(saved.vidsExport.status,'READY');assert.equal(saved.vidsExport.artifact.sha256,'a'.repeat(64));
});

test('lost response after completed receipt is recovered without repeating the export',async()=>{
 const doc=await make('vids-receipt-committed'),a=adapter(input=>result(input,'VIDEO_DRAFT_SAVED'));
 const interrupted={...store,save:async input=>{const written=await store.save(input);if(input.record.vidsExport?.status==='READY')throw Error('SYNTHETIC_LOST_REPLY');return written;}};
 await assert.rejects(service.exportVidsDraft(args(doc,a,{store:interrupted})),/LOST_REPLY/);const saved=await store.get(doc.itemId);assert.equal(saved.vidsExport.status,'READY');
 a.exportPrivateVids=async input=>{assert.equal(input.allowCreate,false);assert.equal(input.reconcileOnly,true);return result(input,'VIDEO_DRAFT_SAVED');};
 await service.exportVidsDraft(checkArgs(saved,a));
});

test('uncertain lock save does not enter adapter, even when lock actually committed',async()=>{
 const doc=await make('vids-lost-lock'),a=adapter();const interrupted={...store,save:async input=>{await store.save(input);throw Error('SYNTHETIC_LOST_LOCK_RESPONSE');}};
 await assert.rejects(service.exportVidsDraft(args(doc,a,{store:interrupted})),/LOST_LOCK_RESPONSE/);assert.equal(a.calls.length,0);
 const locked=await store.get(doc.itemId);assert.equal(locked.vidsExport.status,'ATTEMPTING');
 a.exportPrivateVids=async input=>{assert.equal(input.allowCreate,false);assert.equal(input.reconcileOnly,true);throw Error('GOOGLE_VIDS_OUTCOME_UNCERTAIN');};
 await assert.rejects(service.exportVidsDraft(checkArgs(locked,a)),/OUTCOME_UNCERTAIN/);
});

test('concurrent starts have exactly one durable CAS winner and one adapter call',async()=>{
 const doc=await make('vids-start-race'),a=adapter();const outcomes=await Promise.allSettled([service.exportVidsDraft(args(doc,a)),service.exportVidsDraft(args(doc,a))]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.calls.length,1);assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/CONTENT_VERSION_CHANGED/);
});

test('concurrent pending checks cannot both obtain a writable attempt',async()=>{
 const doc=await make('vids-check-race'),a=adapter();await service.exportVidsDraft(args(doc,a));const pending=await store.get(doc.itemId);a.calls.length=0;
 const outcomes=await Promise.allSettled([service.exportVidsDraft(checkArgs(pending,a)),service.exportVidsDraft(checkArgs(pending,a))]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.calls.length,1);assert.equal(a.calls[0].allowCreate,true);
});

for(const action of ['HOLD','REJECT','EDIT'])test(`founder ${action} racing completion invalidates job and cannot be overwritten`,async()=>{
 const doc=await make('vids-decision-'+action),a=adapter(async input=>{
  const locked=await store.get(doc.itemId);await service.change({db,owner:f.founder.id,id:doc.itemId,expectedHash:service.current(locked).hash,expectedRevision:locked._drive.contentSha256,action,...(action==='EDIT'?{patch:{title:'A changed exact draft'}}:{}),store});
  return result(input,'VIDEO_DRAFT_SAVED');
 });
 await assert.rejects(service.exportVidsDraft(args(doc,a)),/CONTENT_VERSION_CHANGED/);const changed=await store.get(doc.itemId);
 assert.equal(changed.vidsExport.status,'INVALIDATED');assert.equal(changed.status,action==='HOLD'?'HOLD':action==='REJECT'?'REJECTED':'DRAFT');assert.equal(service.current(changed).package.production.media,null);
 await assert.rejects(service.exportVidsDraft(checkArgs(changed,a)),/NOT_APPROVABLE|JOB_INVALIDATED/);
});

test('new image selection invalidates export; a changed package starts a separate explicit job',async()=>{
 const doc=await make('vids-image-change'),a=adapter(input=>result(input,'VIDEO_DRAFT_SAVED'));await service.exportVidsDraft(args(doc,a));const completed=await store.get(doc.itemId),p=service.current(completed).package;
 await service.approveImages({db,owner:f.founder.id,id:doc.itemId,expectedHash:service.current(completed).hash,expectedRevision:completed._drive.contentSha256,images:p.production.imageApproval.images,referenceSha256:p.production.imageApproval.reference.sha256,store,mediaReader:reader});
 const changed=await store.get(doc.itemId);assert.equal(changed.vidsExport.status,'INVALIDATED');assert.equal(changed.vidsExport.artifact.fileId,outputId);
 await service.exportVidsDraft(args(changed,a));assert.notEqual(a.calls[0].operationId,a.calls[1].operationId);assert.equal(a.calls[1].allowCreate,true);
});

test('a confirmed no-write preflight failure permits an explicit check retry of the same job',async()=>{
 const doc=await make('vids-known-preflight'),a=adapter(()=>{throw Object.assign(new Error('GOOGLE_VIDS_AUTH_REQUIRED'),{statusCode:409,startAttempted:false,uploadAttempted:false,outcomeUnknown:false});});
 await assert.rejects(service.exportVidsDraft(args(doc,a)),/AUTH_REQUIRED/);const blocked=await store.get(doc.itemId);assert.equal(blocked.vidsExport.status,'BLOCKED_PRE_WRITE');
 a.exportPrivateVids=async input=>{assert.equal(input.allowCreate,true);assert.equal(input.operationId,blocked.vidsExport.operationId);return result(input);};await service.exportVidsDraft(checkArgs(blocked,a));
});

test('malformed result never becomes ready and sensitive extra fields are not persisted',async()=>{
 const doc=await make('vids-invalid-result'),a=adapter(input=>({...result(input,'VIDEO_DRAFT_SAVED'),sha256:'bad',downloadUri:'https://example.invalid/?SECRET=PRIVATE'}));
 await assert.rejects(service.exportVidsDraft(args(doc,a)),/EXPORT_UNCONFIRMED/);const blocked=await store.get(doc.itemId);assert.equal(blocked.vidsExport.status,'UNCERTAIN');assert(!JSON.stringify(blocked).includes('SECRET='));assert.equal(blocked.vidsExport.artifact,undefined);
});

test('HTTP permits only owner-scoped explicit POST with exact hashes and no injected job data',async()=>{
 const doc=await make('vids-http'),path=`/api/content-factory/${doc.itemId}/google-vids-export`,body={expectedHash:service.current(doc).hash,expectedRevision:doc._drive.contentSha256,action:'START',vidsFileId:sourceId};
 assert.equal((await f.request(f.other,path,'POST',body)).status,404);assert.equal((await f.request(null,path,'POST',body)).status,401);
 for(const extra of [{operationName},{sourceReceipt:{}},{allowCreate:true},{owner:f.other.id},{reconcileOnly:false}])assert.equal((await f.request(f.founder,path,'POST',{...body,...extra})).status,400);
 assert.equal((await originalFetch(f.base+path,{headers:{Authorization:'Bearer '+f.founder.token}})).status,404);
 const real=require('../enterprise/content/privateVidsExport'),saved={inspect:real.inspectPrivateVids,export:real.exportPrivateVids};
 try {
  real.inspectPrivateVids=async args=>receipt(args);real.exportPrivateVids=async input=>result(input,'VIDEO_DRAFT_SAVED');
  const response=await f.request(f.founder,path,'POST',body);assert.equal(response.status,200);assert.equal(response.data.vidsExport.status,'READY');assert.equal(response.data.finalApproval,false);
  const boundary=await f.request(f.founder,'/api/content-factory/workspace/vids-boundary');assert.match(boundary.data.capabilities.vidsExport,/256 MiB/);
 } finally {real.inspectPrivateVids=saved.inspect;real.exportPrivateVids=saved.export;}
});

test('finished-video review is a separate explicit action and invalidates the export job',async()=>{
 const doc=await make('vids-separate-review'),a=adapter(input=>({...result(input,'VIDEO_DRAFT_SAVED'),sha256:google.files.get(outputId).meta.sha256Checksum}));
 await service.exportVidsDraft(args(doc,a));const exported=await store.get(doc.itemId),p=service.current(exported).package;
 assert.equal(p.production.review,null);assert.equal(p.production.media,null);assert.equal(exported.approval,null);
 await service.attachReviewedMedia({db,owner:f.founder.id,id:doc.itemId,expectedHash:service.current(exported).hash,expectedRevision:exported._drive.contentSha256,
  media:{fileId:outputId,sha256:google.files.get(outputId).meta.sha256Checksum,duration:p.duration},checks:Object.fromEntries(service.REVIEW_CHECKS.map(k=>[k,true])),store,mediaReader:reader});
 const reviewed=await store.get(doc.itemId);assert.equal(reviewed.vidsExport.status,'INVALIDATED');assert.equal(reviewed.vidsExport.invalidationReason,'VIDEO_REVIEW_RECORDED');
 assert.equal(service.current(reviewed).package.production.review.method,'FOUNDER_ATTESTATION');assert.equal(reviewed.approval,null);
 await assert.rejects(service.exportVidsDraft(args(reviewed,a)),/REVIEW_ALREADY_RECORDED/);assert.equal(a.calls.length,1);
});
