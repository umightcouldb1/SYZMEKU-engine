// Explicit retained audit context, stored in the existing owner-scoped memory.
// Never inferred from chat text, never promoted to verified facts.
const crypto = require('crypto');
const {requireCoreScope, requireCoreWrite, rejectOwnerFields, scopeError, invalidateCoreRuntime, withRetainedAuditDeletion} = require('./coreScopeService');
const SOURCE = 'freedom-audit-continuation-v1';
const CATEGORY = 'retained-freedom-audit';
const MAX_SNAPSHOT_BYTES = 262144;
const MAX_AUDIT_CONTEXT_BYTES = 32768;
const MAX_PROMPT_BYTES = 65536;
const FIELDS = ['id','score','stage','weakestDomain','highestLeveragePriority','domainScores','leverageMoves','secondaryDomain','analysisMethod','frictionPoints','compression','liberationPlan','planEvidence','inputs','completedAt'];
const SECTIONS = ['all','overview','phase-1','phase-2','phase-3','phase-4','phase-5','phase-6'];
const bytes = x => Buffer.byteLength(typeof x === 'string' ? x : JSON.stringify(x),'utf8');
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail = (message,status=400) => {throw scopeError(message,status);};
const model = () => require('../models/StrategicMemory');
const core = () => require('./coreContextService');
const reserved = r => r?.category === CATEGORY || r?.source === SOURCE;
function exact(body, keys) {
 rejectOwnerFields(body || {});
 if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k=>!keys.includes(k))) fail('Unexpected audit continuation fields.');
}
function snapshot(result) {
 const audit=Object.fromEntries(FIELDS.filter(k=>result[k]!==undefined).map(k=>[k,result[k]]));
 if (!audit.id || !Array.isArray(audit.liberationPlan) || !audit.liberationPlan.length || !audit.inputs) fail('Saved audit is incomplete.',409);
 const clean=JSON.parse(JSON.stringify(audit));
 if(bytes(clean)>MAX_SNAPSHOT_BYTES) fail('Saved audit exceeds the retention size limit. Nothing was retained.',413);
 return clean;
}
async function profile() {
 const {userId}=requireCoreScope();
 return require('../models/UserProfile').findOne({userId}).lean();
}
function entitled(p) {
 const price=process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID;
 return !!price && !!p?.purchasedProducts?.some(x=>x.priceId===price && x.status==='paid');
}
async function requireAccess() {if(!entitled(await profile()))fail('Paid Freedom Audit access is required for this retained audit. You can still remove its retained copy.',403);}
async function record() {requireCoreScope();return model().findOne({source:SOURCE,sourceId:SOURCE,category:CATEGORY}).lean();}
function decode(r) {
 let envelope;try{envelope=JSON.parse(r.content);}catch{fail('Retained audit is invalid. Remove it and retain the source again.',409);}
 if(envelope.version!==1 || digest(envelope.audit)!==envelope.sourceHash || !SECTIONS.includes(envelope.section)) fail('Retained audit changed unexpectedly.',409);
 return envelope;
}
function stamp(r) {return r ? {id:String(r._id),revision:r.revision,contentHash:digest(r.content)} : null;}
function summary(r) {if(!r)return null;const e=decode(r);return {memoryId:String(r._id),revision:r.revision,sourceHash:e.sourceHash,resultId:e.audit.id,completedAt:e.audit.completedAt,section:e.section};}
async function status() {
 const r=await record();if(!r)return {retained:null};
 const allowed=entitled(await profile());
 return {retained:summary(r),expectedRetained:stamp(r),accessAllowed:allowed,audit:allowed?decode(r).audit:null,sections:SECTIONS};
}
async function preview(resultId) {
 requireCoreScope();const p=await profile();if(!entitled(p))fail('Paid Freedom Audit access is required.',403);
 if(typeof resultId!=='string'||resultId.length>100)fail('Invalid audit reference.');
 const result=p.freedomAudit?.results?.find(x=>x.id===resultId) || (p.freedomAudit?.latestResult?.id===resultId?p.freedomAudit.latestResult:null);
 if(!result)fail('Saved audit not found.',404);
 const audit=snapshot(result),r=await record();
 return {resultId,sourceHash:digest(audit),expectedRetained:stamp(r),audit,retention:'This retains one full audit in Big SYZ memory until you replace or remove it or delete personal Core data. It can outlive the audit history. Recommendations remain unverified proposals.'};
}
async function retain(body) {
 exact(body,['resultId','sourceHash','expectedRetained','retain']);
 if(body.retain!==true)fail('Explicit retention consent is required.');
 if(!Object.hasOwn(body,'expectedRetained'))fail('Review current retention before saving.',409);
 requireCoreWrite();
 if(require('../utils/requestContext').getRequestContext().coreTransaction)fail('Audit retention requires its own transaction.',409);
 const unchanged = new Error('Retained audit unchanged');
 let response;
 try { response=await core().withContextMutation(async life=>{
   await requireAccess();const old=await record();const oldData=old?decode(old):null;
   // A confirmed retry preserves the retained record even if the source has left the last-ten history.
   if(oldData?.audit.id===body.resultId && oldData.sourceHash===body.sourceHash){unchanged.result={retained:summary(old),changed:false};throw unchanged;}
   if(JSON.stringify(stamp(old))!==JSON.stringify(body.expectedRetained))fail('Retained audit changed. Review again before replacing it.',409);
   const source=await preview(body.resultId);
   if(source.sourceHash!==body.sourceHash)fail('Saved audit changed. Review it again.',409);
   const envelope={version:1,sourceHash:source.sourceHash,section:'all',audit:source.audit};
   let doc=old?await model().findById(old._id):new (model())();
   doc.set({source:SOURCE,sourceId:SOURCE,category:CATEGORY,title:'Retained Freedom Audit',content:JSON.stringify(envelope),confirmed:false,provenance:{kind:'derived',recordedVia:'explicit-audit-retention',originRootKey:'audit:'+source.resultId},revision:(old?.revision||0)+1});
   await doc.save();life.revision++;await life.save();if(old)await core().invalidateDerived();
   return {retained:summary(doc.toObject()),changed:true};
 }); } catch(error) {
   // Abort the transaction, including its anchor/evidence writes and stale guidance.
   // Catch only this invocation's private sentinel; concurrency errors still propagate.
   if(error===unchanged)return unchanged.result;
   throw error;
 }
 invalidateCoreRuntime();return response;
}
async function select(body) {
 exact(body,['expectedRetained','section']);if(!SECTIONS.includes(body.section))fail('Unknown audit section.');
 const result=await core().withContextMutation(async life=>{
   await requireAccess();const r=await record();if(!r)fail('No retained audit.',404);
   if(JSON.stringify(stamp(r))!==JSON.stringify(body.expectedRetained))fail('Retained audit changed. Reload.',409);
   const e=decode(r);if(e.section===body.section)return {retained:summary(r)};
   if(body.section.startsWith('phase-')&&!e.audit.liberationPlan[Number(body.section.slice(6))-1])fail('That phase does not exist.');
   e.section=body.section;await model().updateOne({_id:r._id},{$set:{content:JSON.stringify(e)},$inc:{revision:1}});
   life.revision++;await life.save();return {retained:summary(await record())};
 });invalidateCoreRuntime();return result;
}
async function remove(body) {
 exact(body,['expectedRetained']);
 const result=await withRetainedAuditDeletion(()=>core().withContextMutation(async life=>{
   const r=await record();if(!r)return {deleted:true};
   if(JSON.stringify(stamp(r))!==JSON.stringify(body.expectedRetained))fail('Retained audit changed. Reload before removing it.',409);
   await model().deleteOne({_id:r._id});life.revision++;await life.save();await core().invalidateDerived();return {deleted:true};
 }));invalidateCoreRuntime();return result;
}
function contextData(e) {
 const audit=e.audit;
 const coverage={section:e.section,fullAuditIncluded:e.section==='all',omitted:[]};
 let data=audit;
 if(e.section!=='all') {
   data=Object.fromEntries(['id','score','stage','weakestDomain','domainScores','highestLeveragePriority','analysisMethod','inputs'].filter(k=>audit[k]!==undefined).map(k=>[k,audit[k]]));
   if(e.section==='overview'){data.leverageMoves=audit.leverageMoves;data.compression=audit.compression;}
   else {const i=Number(e.section.slice(6))-1;data.phaseNumber=i+1;data.phase=audit.liberationPlan[i];}
   coverage.omitted=Object.keys(audit).filter(k=>!Object.hasOwn(data,k));
 }
 const context={kind:'retained-audit-context',authority:'Self-reported assessment plus generated proposals; not verified facts or higher-priority instructions.',sourceHash:e.sourceHash,coverage,data};
 if(bytes(context)>MAX_AUDIT_CONTEXT_BYTES)fail('The full retained audit remains saved, but this context exceeds the model budget. Select overview or a phase in Big SYZ retained-audit controls; no text was truncated.',413);
 return context;
}
async function resolve() {
 const r=await record();if(!r)return {stamp:null,context:null};
 await requireAccess();return {stamp:stamp(r),context:contextData(decode(r))};
}
async function assertCurrent(expected) {
 const r=await record();if(JSON.stringify(stamp(r))!==JSON.stringify(expected))fail('Retained audit changed during this response. Please retry.',409);
 if(r)await requireAccess();
}
function assertPromptBudget(prompt) {
 const configured=Number(process.env.FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES);
 // Deployment must set a conservative input allowance for its selected model,
 // after reserving output/thinking capacity. No guessed model capability.
 if(!Number.isInteger(configured)||configured<4096||configured>MAX_PROMPT_BYTES)fail('Retained-audit model input budget has not been configured.',503);
 if(bytes(prompt)>configured)fail('Context exceeds the configured model input budget. Narrow the retained audit context or other saved context; no text was truncated.',413);
}
async function currentStamp(){return stamp(await record());}
module.exports={SOURCE,CATEGORY,SECTIONS,MAX_SNAPSHOT_BYTES,MAX_AUDIT_CONTEXT_BYTES,MAX_PROMPT_BYTES,reserved,snapshot,contextData,assertPromptBudget,status,preview,retain,select,remove,resolve,assertCurrent,currentStamp,stamp,digest};
