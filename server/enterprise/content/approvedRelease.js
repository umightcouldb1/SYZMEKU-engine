'use strict';
// The only new C0 distribution path: exact approved Drive MP4 -> existing YouTube
// channel. Release, schedule activation and uploading are separate explicit actions.
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { hash, qa } = require('./qa');
const { createStore, pointerKey, KIND } = require('./driveDraftStore');
const { createMediaReader } = require('./driveMedia');
const { buildYouTubeUploadRequest } = require('../../social/providers/youtubeProvider');
const Campaign = require('../../models/SocialCampaign');
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { statusCode }); };
const current = doc => doc?.versions?.find(v => v.number === doc.currentVersion);
const fingerprint = post => hash({provider:post.provider, format:post.format, connectedAccountId:String(post.connectedAccountId || ''),
 title:post.title, caption:post.caption, description:post.description, hashtags:[...(post.hashtags || [])], link:post.link,
 mediaAssets:clone(post.mediaAssets || []), metadata:clone(post.metadata || {}), scheduledTime:post.scheduledTime ? new Date(post.scheduledTime).toISOString() : null});
const maxBytes = () => {
 const n = Number(process.env.YOUTUBE_MAX_UPLOAD_BYTES || 75 * 1024 * 1024);
 if (!Number.isSafeInteger(n) || n < 1 || n > 256 * 1024 * 1024) fail('C0_MEDIA_LIMIT_INVALID');
 return n;
};
async function authority(db, owner, env = process.env) {
 const service = require('./service');
 if (!service.active(env) || owner !== require('../policy').ownerId(env) || !await db.collection('users').findOne({_id:new mongoose.Types.ObjectId(owner),role:'COMMANDER_IN_CHIEF'})) fail('C0_PUBLICATION_DISABLED');
}
function approved(doc, owner, expectedHash, expectedRevision) {
 if (!doc || doc.owner !== owner || !doc._drive) fail('NOT_FOUND',404);
 if (expectedHash && current(doc)?.hash !== expectedHash || expectedRevision && doc._drive.contentSha256 !== expectedRevision) fail('CONTENT_VERSION_CHANGED');
 if (doc.status !== 'APPROVED' || doc.approval?.scope !== 'EXACT_DRIVE_MEDIA_APPROVAL' || doc.approval.approvedBy !== owner || doc.approval.hash !== current(doc)?.hash || doc.approval.version !== doc.currentVersion) fail('C0_APPROVAL_INVALIDATED');
 if (current(doc).package.platform !== 'youtube') fail('C0_RELEASE_YOUTUBE_ONLY');
}
async function connected(db, owner, options) {
 if (!/^[a-f0-9]{24}$/.test(options.connectionId || '') || typeof options.providerAccountId !== 'string' || !options.providerAccountId) fail('C0_RELEASE_CHANNEL_REQUIRED',400);
 const connection = await db.collection('socialconnections').findOne({_id:new mongoose.Types.ObjectId(options.connectionId),userId:new mongoose.Types.ObjectId(owner),active:true,provider:'youtube',accountType:'youtube_channel'});
 if (!connection || connection.providerAccountId !== options.providerAccountId || !connection.scopes?.includes('https://www.googleapis.com/auth/youtube.upload') || !connection.scopes?.includes('https://www.googleapis.com/auth/youtube.readonly')) fail('C0_RELEASE_CHANNEL_UNAVAILABLE');
 return connection;
}
function planFor(doc, options, sourceRevision = doc._drive.contentSha256) {
 const p = current(doc).package;
 if (!['public','unlisted','private'].includes(options.privacyStatus) || options.scheduledTime !== null && (typeof options.scheduledTime !== 'string' || !Number.isFinite(Date.parse(options.scheduledTime)))) fail('C0_RELEASE_OPTIONS_REQUIRED',400);
 const scheduledTime = options.scheduledTime ? new Date(options.scheduledTime).toISOString() : null;
 const metadata = {privacyStatus:options.privacyStatus, categoryId:'27', c0MediaSha256:p.production?.media?.sha256};
 const upload = buildYouTubeUploadRequest({title:p.title,description:p.description,link:p.destination?.url || '',hashtags:p.hashtags,metadata});
 // The founder previews the exact provider-normalized copy, not silently truncated source text.
 const post = {provider:'youtube',format:'video',connectedAccountId:options.connectionId,title:upload.snippet.title,description:upload.snippet.description,
  caption:'',hashtags:upload.snippet.tags || [],link:'',scheduledTime,metadata,
  mediaAssets:[{assetId:'',url:'',type:'video',mimeType:'video/mp4',altText:'',metadata:{storage:'GOOGLE_DRIVE',fileId:p.production?.media?.fileId,sha256:p.production?.media?.sha256}}]};
 const exactUpload = buildYouTubeUploadRequest(post);
 const postHash = fingerprint(post), fields = {owner:doc.owner,itemId:doc.itemId,hash:current(doc).hash,version:doc.currentVersion,sourceRevision,postHash,uploadHash:hash(exactUpload),providerAccountId:options.providerAccountId};
 return {post,postHash,uploadHash:fields.uploadHash,planHash:hash(fields),sourceRevision,provider:'youtube',connectionId:options.connectionId,providerAccountId:options.providerAccountId,privacyStatus:options.privacyStatus,scheduledTime,
  media:{fileId:p.production?.media?.fileId,sha256:p.production?.media?.sha256},upload:exactUpload};
}
async function verifySources({db,owner,doc,store,mediaReader}) {
 const p = current(doc).package, service = require('./service');
 const learned = await service.voiceState(db,owner,{store});
 if (!qa(p,learned.rules).canApprove) fail('C0_QA_CHANGED');
 if (p.production?.review?.by !== owner || p.production?.imageApproval?.approvedBy !== owner) fail('C0_APPROVAL_INVALIDATED');
 const reader = mediaReader || await createMediaReader({owner});
 await service.assertSelectedImages(p,reader);
 const video = await reader.inspect(p.production.media.fileId,'video');
 if (video.sha256 !== p.production.media.sha256 || video.mimeType !== 'video/mp4') fail('C0_MEDIA_CHANGED');
 if (video.size > maxBytes()) fail('C0_RELEASE_MEDIA_TOO_LARGE');
 return reader;
}
async function previewRelease({db,owner,id,expectedHash,expectedRevision,options,store,mediaReader}) {
 if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || !/^[a-f0-9]{64}$/.test(expectedRevision || '')) fail('EXACT_VERSIONS_REQUIRED',400);
 await authority(db,owner);store ||= createStore({db,owner});
 const doc = await store.get(id);approved(doc,owner,expectedHash,expectedRevision);
 const connection = await connected(db,owner,options);
 await verifySources({db,owner,doc,store,mediaReader});
 if (doc.release) fail('C0_RELEASE_EXISTS');
 const plan = planFor(doc,options);
 if (plan.scheduledTime && Date.parse(plan.scheduledTime) <= Date.now()) fail('C0_RELEASE_FUTURE_TIME_REQUIRED');
 return {...plan,accountName:connection.accountName,execution:'NONE',maxBytes:maxBytes()};
}
async function releaseApproved({db,owner,id,expectedHash,expectedRevision,options,planHash,store,mediaReader,campaigns=Campaign}) {
 if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || !/^[a-f0-9]{64}$/.test(expectedRevision || '')) fail('EXACT_VERSIONS_REQUIRED',400);
 await authority(db,owner);store ||= createStore({db,owner});let doc = await store.get(id);
 approved(doc,owner,expectedHash);
 if (!/^[a-f0-9]{64}$/.test(expectedRevision || '') || !/^[a-f0-9]{64}$/.test(planHash || '')) fail('EXACT_VERSIONS_REQUIRED',400);
 const existing = doc.release;
 if (doc._drive.contentSha256 !== expectedRevision && existing?.sourceRevision !== expectedRevision) fail('CONTENT_VERSION_CHANGED');
 await connected(db,owner,options);await verifySources({db,owner,doc,store,mediaReader});
 const plan = planFor(doc,options,existing?.sourceRevision || expectedRevision);
 if (plan.planHash !== planHash || existing && existing.planHash !== planHash) fail('C0_RELEASE_CHANGED');
 if (!existing && plan.scheduledTime && Date.parse(plan.scheduledTime) <= Date.now()) fail('C0_RELEASE_FUTURE_TIME_REQUIRED');
 const campaignId = hash({kind:'C0_DRIVE_RELEASE_V1',owner,id,planHash}).slice(0,24), postId = hash({campaignId,kind:'post'}).slice(0,24);
 const release = existing || {releaseId:crypto.randomUUID(),campaignId,postId,sourceRevision:plan.sourceRevision,hash:expectedHash,version:doc.currentVersion,
  postHash:plan.postHash,uploadHash:plan.uploadHash,planHash,provider:'youtube',connectionId:plan.connectionId,providerAccountId:plan.providerAccountId,privacyStatus:plan.privacyStatus,scheduledTime:plan.scheduledTime,
  approvedBy:owner,approvedAt:new Date().toISOString(),status:'RELEASED'};
 if (existing && (existing.campaignId !== campaignId || existing.postHash !== plan.postHash || existing.hash !== expectedHash || existing.approvedBy !== owner)) fail('C0_RELEASE_CHANGED');
 if (!existing) doc = await store.save({id,expectedHash,expectedContentSha256:expectedRevision,record:{...clone(doc),release,socialCampaignId:campaignId,updatedAt:new Date()}});
 // Only final, explicitly released metadata crosses into Mongo. Draft history and
 // all bytes remain private in Drive. Stable identity makes response-loss retries safe.
 const receipt = {...release,itemId:id,storage:'GOOGLE_DRIVE'};
 let saved = await campaigns.findOne({_id:campaignId,userId:owner});
 if (!saved) {
  // A concurrent HOLD after release can never authorize a usable campaign.
  const latest = await store.get(id);approved(latest,owner,expectedHash);
  if (latest.release?.releaseId !== release.releaseId) fail('C0_APPROVAL_INVALIDATED');
  const final = {_id:campaignId,userId:owner,name:plan.post.title,status:'approved',approvedAt:release.approvedAt,posts:[{...plan.post,_id:postId,publishStatus:'approved'}],metadata:{c0:receipt}};
  const validation = new Campaign(final).validateSync();if (validation) fail('C0_RELEASE_INVALID',400);
  try { saved = await campaigns.create(final); }
  catch (error) {
   try {saved = await campaigns.findOne({_id:campaignId,userId:owner});} catch {fail('C0_RELEASE_OUTCOME_UNCERTAIN',503);}
   if (!saved) throw error;
  }
 }
 if (saved.metadata?.c0?.releaseId !== release.releaseId || String(saved.userId) !== owner || fingerprint(saved.posts[0]) !== plan.postHash || saved.status === 'draft') fail('C0_RELEASE_CHANGED');
 return {campaignId,postId,release,revision:doc._drive.contentSha256,execution:'FINAL_SOCIAL_RECORD_ONLY',scheduled:false,published:false};
}
async function assertReleasedPublication({db,campaign,post,store,env=process.env,checkTime=true}) {
 const owner = String(campaign.userId);await authority(db,owner,env);store ||= createStore({db,owner});
 const receipt = campaign.metadata?.c0, doc = await store.get(receipt?.itemId);approved(doc,owner);
 const release = doc.release;
 if (!release || release.approvedBy !== owner || release.hash !== current(doc).hash || release.version !== doc.currentVersion || release.releaseId !== receipt.releaseId ||
  hash({...release,itemId:doc.itemId,storage:'GOOGLE_DRIVE'}) !== hash(clone(receipt)) || String(campaign._id) !== release.campaignId || String(post._id) !== release.postId || campaign.posts.length !== 1 ||
  fingerprint(post) !== release.postHash || planFor(doc,release,release.sourceRevision).planHash !== release.planHash || release.status !== 'RELEASED') fail('C0_APPROVAL_INVALIDATED');
 await connected(db,owner,release);
 if (checkTime && release.scheduledTime && Date.parse(release.scheduledTime) > Date.now()) fail('C0_APPROVED_TIME_NOT_DUE');
 return {doc,store,owner,release};
}
async function publishReleasedPost({db,campaign,post,store,mediaReader,provider,connection,accessToken,campaigns=Campaign}) {
 let state = await assertReleasedPublication({db,campaign,post,store});
 if (Number(post.publishAttempts || 0) > 0 || ['publishing','failed'].includes(post.publishStatus)) fail('C0_PUBLICATION_INSPECTION_REQUIRED');
 const reader = await verifySources({db,...state,mediaReader});
 const media = await reader.readExactVideo({...state.doc.versions.find(v=>v.number===state.doc.currentVersion).package.production.media,maxBytes:maxBytes()});
 // Check live channel identity with the EXISTING read grant before any upload.
 const accounts = await provider.getConnectedAccounts({accessToken});
 if (!accounts.some(a=>a.providerAccountId === state.release.providerAccountId)) fail('C0_RELEASE_CHANNEL_CHANGED');
 state = await assertReleasedPublication({db,campaign,post,store:state.store});
 const operationId = 'publish:' + crypto.randomUUID(), states = db.collection('enterprisestates');
 const filter = {_id:pointerKey(state.owner,state.doc.itemId),owner:state.owner,kind:KIND,contentSha256:state.doc._drive.contentSha256,status:'APPROVED',operationId:{$exists:false}};
 const acquired = await states.updateOne(filter,{$set:{operationId}});
 if (acquired.modifiedCount !== 1) fail('CONTENT_VERSION_CHANGED');
 let attempted = false, recorded = false;
 try {
  // The Drive pointer lock serializes HOLD/edit against publication's irreversible
  // boundary. A durable Mongo claim also excludes duplicate clicks/processes.
  const claim = await campaigns.updateOne({_id:campaign._id,userId:campaign.userId,'metadata.c0.releaseId':state.release.releaseId,
   posts:{$elemMatch:{_id:post._id,publishStatus:{$in:['approved','scheduled']},publishAttempts:0}}},
   {$set:{'posts.$.publishStatus':'publishing','posts.$.publishAttempts':1,'posts.$.nextPublishAttemptAt':null,'posts.$.idempotencyKey':state.release.releaseId}});
  if (claim.modifiedCount !== 1) fail('C0_PUBLICATION_INSPECTION_REQUIRED');
  attempted = true; // Any crash or error from now on requires inspection, never retry.
  const result = await provider.publishVideo({connection,accessToken,post,approvedMedia:media});
  if (!result?.id) fail('C0_PUBLICATION_OUTCOME_UNCERTAIN',503);
  const saved = await campaigns.updateOne({_id:campaign._id,'posts._id':post._id,'metadata.c0.releaseId':state.release.releaseId},{$set:{'posts.$.publishStatus':'published','posts.$.providerPostId':result.id,'posts.$.providerUrl':result.url || '', 'posts.$.publishedAt':new Date(),'posts.$.error':{},'posts.$.nextPublishAttemptAt':null}});
  if (saved.modifiedCount !== 1) fail('C0_PUBLICATION_OUTCOME_UNCERTAIN',503);
  recorded = true;post.publishStatus='published';post.providerPostId=result.id;post.providerUrl=result.url || '';
  return {post,result};
 } catch (error) {
  if (attempted) {
   // Do not persist provider payloads/tokens. Leave the lock on an uncertain outcome.
   try {await campaigns.updateOne({_id:campaign._id,posts:{$elemMatch:{_id:post._id,publishStatus:'publishing'}}},{$set:{'posts.$.publishStatus':'failed','posts.$.nextPublishAttemptAt':null,'posts.$.error':{code:'C0_PUBLICATION_INSPECTION_REQUIRED',message:'Upload outcome requires inspection. Automatic and manual retry are blocked.',at:new Date()}}});} catch { /* durable claim remains */ }
   fail('C0_PUBLICATION_INSPECTION_REQUIRED',503);
  }
  throw error;
 } finally {
  media.buffer.fill(0);
  if (!attempted || recorded) await states.updateOne({_id:filter._id,operationId},{$unset:{operationId:''}});
 }
}
module.exports = {previewRelease,releaseApproved,assertReleasedPublication,publishReleasedPost,fingerprint,maxBytes};
