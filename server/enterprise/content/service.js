const crypto=require('node:crypto');
const {enabled,ownerId}=require('../policy');
const {catalog,calendar,finish,regenerate}=require('./catalog');
const {CONTRACT,VOICES,validateFeedback}=require('./voice');
const {CONTRACT:VISUAL_CONTRACT,VISUAL_REVIEW}=require('./visual');
const {qa,hash}=require('./qa');
const COLLECTION='enterprisestates';
const fail=(code,status=400)=>{const e=new Error(code);e.statusCode=status;throw e;};
const key=(owner,id)=>`c0:item:${owner}:${id}`;
const dayKey=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const json=value=>JSON.parse(JSON.stringify(value));
function active(env=process.env){return enabled(env)&&env.CONTENT_FACTORY_ENABLED==='true';}
async function voiceState(db,owner,options={}){return await db.collection(COLLECTION).findOne({_id:'c0:voice:'+owner,owner},options)||{version:1,rules:[]};}
async function prepareDaily({db,env=process.env,now=new Date()}){
 if(!active(env))return {status:'OFF'};const owner=ownerId(env);
 const {ObjectId}=require('mongoose').mongo;
 if(!await db.collection('users').findOne({_id:new ObjectId(owner),role:'COMMANDER_IN_CHIEF'},{projection:{_id:1}}))return {status:'OWNER_UNAVAILABLE'};
 const states=db.collection(COLLECTION),today=dayKey(now),start=env.CONTENT_FACTORY_START_DATE||today;
 const day=Math.floor((Date.parse(today)-Date.parse(start))/86400000)+1;
 if(!Number.isFinite(day)||day<1||day>30)return {status:'CALENDAR_COMPLETE_OR_NOT_STARTED'};
 await states.updateOne({_id:'c0:voice:'+owner},{$setOnInsert:{owner,kind:'C0_VOICE',version:1,rules:[]}},{upsert:true});
 const learned=await voiceState(db,owner);let created=0;
 for(const item of catalog().filter(x=>x.package.day<=day)){
  const p=regenerate(item.package,learned.rules),version={number:1,hash:hash(p),package:p,createdAt:now,voiceRulesVersion:learned.version};
  try{const r=await states.updateOne({_id:key(owner,item.id)},{$setOnInsert:{kind:'C0_ITEM',owner,itemId:item.id,currentVersion:1,versions:[version],status:'DRAFT',approval:null,createdAt:now,updatedAt:now}},{upsert:true});created+=r.upsertedCount;}catch(e){if(e.code!==11000)throw e;}
 }
 await states.updateOne({_id:'c0:daily:'+owner},{$set:{kind:'C0_DAILY',owner,lastPreparedAt:now,date:today,day,created,calendarStart:start,externalSpend:0}},{upsert:true});
 return {status:'OK',day,created};
}
function startDaily({connection,env=process.env}){if(!active(env))return()=>{};let running=false;const tick=async()=>{if(running||connection.readyState!==1)return;running=true;try{await prepareDaily({db:connection.db,env});}catch{console.warn('[content-factory] preparation unavailable');}finally{running=false;}};const first=setTimeout(tick,35000),timer=setInterval(tick,15*60*1000);first.unref();timer.unref();return()=>{clearTimeout(first);clearInterval(timer);};}
function current(doc){return doc.versions.find(v=>v.number===doc.currentVersion);}
async function list(db,owner){const learned=await voiceState(db,owner),items=await db.collection(COLLECTION).find({kind:'C0_ITEM',owner}).sort({createdAt:-1,itemId:1}).limit(100).toArray();const daily=await db.collection(COLLECTION).findOne({_id:'c0:daily:'+owner,owner});const enterprise=await db.collection(COLLECTION).findOne({_id:'freedom-audit:'+owner,owner},{projection:{'brief.findings':1,'brief.revenue':1,'brief.funnel':1,lastSuccessAt:1}});
 return {visual:VISUAL_CONTRACT,voice:{...CONTRACT,feedbackVersion:learned.version,learned:learned.rules},calendar:calendar(),daily,items:items.map(d=>({id:d.itemId,version:d.currentVersion,hash:current(d).hash,status:d.status,approval:d.approval,socialCampaignId:d.socialCampaignId||null,package:current(d).package,qa:qa(current(d).package,learned.rules),history:d.versions.map(v=>({version:v.number,hash:v.hash,createdAt:v.createdAt}))})),performance:{source:'E0 enterprise snapshot, not personal context',observedAt:enterprise?.lastSuccessAt||null,revenue:enterprise?.brief?.revenue||null,findings:enterprise?.brief?.findings||[],metrics:{impressions:null,reach:null,CTR:null,views:null,watchTime:null,retention:null,dropOff:null,likes:null,comments:null,shares:null,subscribers:null,profileVisits:null,outboundClicks:null,attributedLandingSessions:null,attributedCheckoutStarts:null,attributedPurchases:null,attributedRevenue:null},coverage:'Per-content conversion attribution UNKNOWN; do not optimize on views alone or attribute aggregate sales to a draft.',recommendation:'Collect comparable attention, engagement and verified traffic/conversion evidence; recorded outcomes require founder assessment.'},production:{googleVidsAssembly:'INTERACTIVE_UI_REQUIRED',googleDriveDownload:'API_AVAILABLE; authorized Drive OAuth and existing Vids file required',externalSpend:0,continuous:'While Render is awake; 30-day prepared calendar; no always-on SLA.',generation:'Deterministic prepared material and founder corrections; no paid model/media calls.'}};
}
function validatePatch(patch){const allowed=['voice','intensity','title','description','cta','scenes','destination','hashtags','keywords','distribution','pinnedComment','approvalExceptions'];if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!allowed.includes(k)))fail('INVALID_CONTENT_PATCH');if(JSON.stringify(patch).length>60000)fail('CONTENT_TOO_LARGE');}
function validatePackage(p){if(!VOICES.includes(p.voice)||![0,1,2].includes(p.intensity))fail('INVALID_LINEAGE_VOICE');if(typeof p.title!=='string'||p.title.length>160||typeof p.description!=='string'||p.description.length>5000||typeof p.cta!=='string'||p.cta.length>300)fail('INVALID_COPY');if(!Array.isArray(p.scenes)||p.scenes.length>60||p.scenes.some(s=>typeof s.narration!=='string'||typeof s.screen!=='string'||s.narration.length>12000||s.screen.length>1000||!Number.isFinite(s.start)||!Number.isFinite(s.end)))fail('INVALID_SCENES');for(const k of ['hashtags','keywords','approvalExceptions'])if(!Array.isArray(p[k])||p[k].length>30||p[k].some(s=>typeof s!=='string'||s.length>100))fail('INVALID_METADATA');if(p.destination?.url){let u;try{u=new URL(p.destination.url);}catch{fail('INVALID_DESTINATION');}if(u.protocol!=='https:'||u.hostname!=='freedom.toisouljahacademy.com')fail('UNAPPROVED_DESTINATION');}if(p.distribution?.connectionId&&!/^[a-f0-9]{24}$/.test(p.distribution.connectionId))fail('INVALID_CONNECTION');if(p.distribution?.scheduledTime&&!Number.isFinite(Date.parse(p.distribution.scheduledTime)))fail('INVALID_SCHEDULE');}
async function change({db,owner,id,expectedHash,action,patch,feedback}){
 const states=db.collection(COLLECTION),doc=await states.findOne({_id:key(owner,id),owner});if(!doc)fail('NOT_FOUND',404);const old=current(doc);if(old.hash!==expectedHash)fail('CONTENT_VERSION_CHANGED',409);if(doc.status==='APPROVING')fail('CONTENT_BUSY',409);
 if(!['EDIT','REGENERATE','HOLD','REJECT','FEEDBACK'].includes(action))fail('INVALID_ACTION');
 if((feedback&&!validateFeedback(feedback))||(action==='FEEDBACK'&&!feedback))fail('INVALID_FEEDBACK');
 if(feedback)feedback={...feedback,voice:feedback.voice||old.package.voice,category:feedback.category||'wrong_terminology'};
 const learned=await voiceState(db,owner);let packageNext=old.package;
 if(action==='EDIT'){validatePatch(patch);packageNext=finish({...json(old.package),...json(patch)});packageNext.production={...old.package.production,status:'PACKAGE_READY_MEDIA_PENDING',media:null,review:null};validatePackage(packageNext);}
 if(action==='REGENERATE'){packageNext=regenerate(old.package,[...learned.rules,...(feedback?[feedback]:[])],true);if(hash(packageNext)===old.hash)fail('NO_NEW_DIRECTION_PROVIDED',409);}
 const revised=['EDIT','REGENERATE'].includes(action);if(revised&&doc.versions.length>=20)fail('VERSION_LIMIT_REACHED',409);
 const update={$set:{status:action==='HOLD'?'HOLD':action==='REJECT'?'REJECTED':'DRAFT',approval:null,updatedAt:new Date()}};
 if(revised){update.$set.currentVersion=doc.currentVersion+1;update.$push={versions:{number:doc.currentVersion+1,hash:hash(packageNext),package:packageNext,createdAt:new Date(),voiceRulesVersion:learned.version}};}
 const result=await states.updateOne({_id:doc._id,owner,currentVersion:doc.currentVersion,'versions.hash':expectedHash,status:doc.status},update);if(!result.modifiedCount)fail('CONTENT_VERSION_CHANGED',409);
 if(feedback){await states.updateOne({_id:'c0:voice:'+owner},{$setOnInsert:{owner,kind:'C0_VOICE'},$inc:{version:1},$push:{rules:{$each:[{...feedback,action,source:id,version:doc.currentVersion,at:new Date()}],$slice:-100}}},{upsert:true});}
 return {changed:true,approvalInvalidated:true,execution:'NONE'};
}
const REVIEW_CHECKS=['rendered_media','mobile_readability','audio_continuity','dead_air','unwanted_speech','blank_frames','transitions','subtitle_alignment','message_accuracy',...VISUAL_REVIEW];
async function attachReviewedMedia({db,owner,id,expectedHash,media,checks}){
 if(!media||typeof media.url!=='string'||!/^https:\/\/www\.toisouljahacademy\.com\/assets\/content-factory\/[a-zA-Z0-9._/-]+\.mp4$/.test(media.url)||!(/^[a-f0-9]{64}$/).test(media.sha256)||!Number.isFinite(media.duration)||media.duration<=0||REVIEW_CHECKS.some(k=>checks?.[k]!==true)||Object.keys(checks).some(k=>!REVIEW_CHECKS.includes(k)))fail('EXACT_MEDIA_AND_REVIEW_REQUIRED');
 const states=db.collection(COLLECTION),doc=await states.findOne({_id:key(owner,id),owner});if(!doc)fail('NOT_FOUND',404);const old=current(doc);if(old.hash!==expectedHash||doc.status==='APPROVING')fail('CONTENT_VERSION_CHANGED',409);if(doc.versions.length>=20)fail('VERSION_LIMIT_REACHED',409);
 // This endpoint is an explicit founder attestation, never labeled automated media QA.
 const p=json(old.package);p.production={status:'FOUNDER_REVIEWED_MEDIA',media:{url:media.url,sha256:media.sha256,duration:media.duration},review:{method:'FOUNDER_ATTESTATION',by:owner,at:new Date().toISOString(),checks}};if(Math.abs(p.duration-media.duration)>2)fail('MEDIA_DURATION_MISMATCH');
 const r=await states.updateOne({_id:doc._id,owner,currentVersion:doc.currentVersion,status:doc.status},{$set:{currentVersion:doc.currentVersion+1,status:'DRAFT',approval:null,updatedAt:new Date()},$push:{versions:{number:doc.currentVersion+1,hash:hash(p),package:p,createdAt:new Date()}}});if(!r.modifiedCount)fail('CONTENT_VERSION_CHANGED',409);return {recorded:true,method:'FOUNDER_ATTESTATION',approvalInvalidated:true};
}
const postFingerprint=post=>hash({provider:post.provider,format:post.format,connectedAccountId:String(post.connectedAccountId||''),title:post.title,caption:post.caption,description:post.description,hashtags:[...(post.hashtags||[])],link:post.link,mediaAssets:(post.mediaAssets||[]).map(a=>({url:a.url,type:a.type})),scheduledTime:post.scheduledTime?new Date(post.scheduledTime).toISOString():null,metadata:json(post.metadata||{})});
async function approveMany({db,client,owner,items}){
 if(!Array.isArray(items)||!items.length||items.length>20||items.some(x=>typeof x.id!=='string'||!Number.isInteger(x.version)||!(/^[a-f0-9]{64}$/).test(x.hash))||new Set(items.map(x=>x.id)).size!==items.length)fail('EXACT_VERSIONS_REQUIRED');
 const {ObjectId}=require('mongoose').mongo,session=client.startSession();const result=[];
 try{await session.withTransaction(async()=>{result.length=0;const learned=await voiceState(db,owner,{session});for(const item of items){const states=db.collection(COLLECTION),doc=await states.findOne({_id:key(owner,item.id),owner},{session});if(!doc)fail('NOT_FOUND',404);const v=current(doc);if(v.hash!==item.hash||v.number!==item.version)fail('CONTENT_VERSION_CHANGED',409);if(doc.status==='APPROVED'&&doc.approval?.hash===item.hash){result.push({id:item.id,campaignId:String(doc.socialCampaignId)});continue;}if(!['DRAFT','HOLD'].includes(doc.status))fail('CONTENT_NOT_APPROVABLE',409);if(!qa(v.package,learned.rules).canApprove)fail('QA_NOT_PASSED',409);
  const p=v.package,connection=await db.collection('socialconnections').findOne({_id:new ObjectId(p.distribution?.connectionId||'000000000000000000000000'),userId:new ObjectId(owner),active:true},{session});if(!connection||connection.provider!==(p.platform==='facebook'||p.platform==='instagram'?'meta':p.platform)||(p.platform==='facebook'&&connection.accountType!=='facebook_page')||(p.platform==='instagram'&&connection.accountType!=='instagram_professional'))fail('OWNED_PLATFORM_CONNECTION_REQUIRED',409);
  if(p.distribution?.scheduledTime&&Date.parse(p.distribution.scheduledTime)<=Date.now())fail('PROPOSED_SCHEDULE_EXPIRED',409);
  const campaignId=new ObjectId(),post={_id:new ObjectId(),provider:connection.provider,connectedAccountId:connection._id,format:p.type==='longform'?'video':p.platform==='instagram'?'reel':p.platform==='youtube'?'short':'video',title:p.title,caption:p.description,description:p.description,hashtags:p.hashtags,link:p.platform==='instagram'||p.platform==='youtube'&&p.type!=='longform'?'':p.destination.url?`${p.destination.url.replace(/\?.*$/,'')}?utm_source=${p.platform}&utm_medium=social&utm_campaign=freedom_audit_launch&utm_content=${p.attribution}`:'',mediaAssets:[{url:p.production.media.url,type:'video'}],metadata:{c0MediaSha256:p.production.media.sha256},scheduledTime:p.distribution?.scheduledTime?new Date(p.distribution.scheduledTime):null,publishStatus:'draft'};
  const approval={hash:item.hash,version:v.number,approvedBy:owner,approvedAt:new Date(),scope:'EXACT_CONTENT_HANDOFF_TO_SOCIAL_DRAFT',postHash:postFingerprint(post)};
  await db.collection('socialcampaigns').replaceOne({_id:campaignId,userId:new ObjectId(owner)}, {_id:campaignId,userId:new ObjectId(owner),name:'C0 · '+p.title,objective:p.purpose,sourceProduct:p.type==='sales'?'The Freedom Audit':'T.O.I. education',status:'draft',posts:[post],metadata:{c0:{itemId:item.id,...approval}},createdAt:new Date(),updatedAt:new Date()},{upsert:true,session});
  const changed=await states.updateOne({_id:doc._id,owner,currentVersion:v.number,status:doc.status},{$set:{status:'APPROVED',approval,socialCampaignId:String(campaignId),updatedAt:new Date()}},{session});if(!changed.modifiedCount)fail('CONTENT_VERSION_CHANGED',409);result.push({id:item.id,campaignId:String(campaignId)});
 }});return {approved:result,execution:'NONE',handoff:'Social drafts only. Existing explicit founder scheduling/publishing approval remains required.'};}finally{await session.endSession();}
}
async function assertPublication({db,campaign,post,env=process.env}){const receipt=campaign.metadata?.c0;if(!receipt)return;const owner=String(campaign.userId);if(!active(env)||owner!==ownerId(env))fail('C0_PUBLICATION_DISABLED',409);const doc=await db.collection(COLLECTION).findOne({_id:key(owner,receipt.itemId),owner});if(!doc||doc.status!=='APPROVED'||doc.approval?.hash!==receipt.hash||current(doc).hash!==receipt.hash||postFingerprint(post)!==receipt.postHash)fail('C0_APPROVAL_INVALIDATED',409);const learned=await voiceState(db,owner);if(!qa(current(doc).package,learned.rules).canApprove)fail('C0_QA_CHANGED',409);}
module.exports={active,prepareDaily,startDaily,list,change,attachReviewedMedia,approveMany,assertPublication,postFingerprint,current,key,voiceState,REVIEW_CHECKS};



