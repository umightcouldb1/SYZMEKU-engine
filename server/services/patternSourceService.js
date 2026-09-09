const crypto=require('node:crypto');
const {exact,key,scalar,stable}=require('../logic/patternRules');
const {scopeError}=require('./coreScopeService');
const {requirePatternWrite}=require('./patternCapabilityService');
const bad=message=>{throw scopeError(message,400);};
function eventData(input){
  exact(input,['subjectKey','values','unit','interventionKey','phase','coverage','taskRef']);
  key(input.subjectKey);exact(input.values,Object.keys(input.values||{}));
  if(Object.keys(input.values).length>8)bad('At most eight observed attributes are permitted.');
  for(const [k,v]of Object.entries(input.values)){key(k);scalar(v);}
  const result={subjectKey:input.subjectKey,values:input.values};
  if(input.unit!==undefined)result.unit=key(input.unit);
  if(input.interventionKey!==undefined)result.interventionKey=key(input.interventionKey);
  if(input.phase!==undefined){if(!['intervention','baseline','post'].includes(input.phase)||!result.interventionKey)bad('Invalid intervention phase.');result.phase=input.phase;}
  if(input.taskRef!==undefined){if(!/^[a-f\d]{24}$/.test(input.taskRef))bad('Invalid task reference.');result.taskRef=input.taskRef;}
  if(input.coverage!==undefined){exact(input.coverage,['start','end','complete']);const start=new Date(input.coverage.start),end=new Date(input.coverage.end);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start||+end>Date.now()||input.coverage.complete!==true)bad('Explicit completed observation coverage is required.');result.coverage={start,end,complete:true};}
  return result;
}
async function observationMetadata(payload){
  if(payload.event===undefined)return {};
  requirePatternWrite();
  if(payload.source!==undefined&&payload.source!=='user')bad('Only explicit user-reported events are eligible in M2. Imports and generated sources are not supported.');
  if(!payload.occurredAt||!Number.isFinite(+new Date(payload.occurredAt))||+new Date(payload.occurredAt)>Date.now())bad('Record the actual occurrence time, not a future time.');
  const event=eventData(payload.event);
  if(event.taskRef&&!await require('../models/Task').exists({_id:event.taskRef}))throw scopeError('Task not found.',404);
  const root='event:'+crypto.randomUUID();
  return {event,revision:1,eventKey:root,provenance:{kind:'user_event',originRootKey:root,recordedVia:'explicit-observation'}};
}
function intentData(payload){
  exact(payload,['goalId','dueAt','subjectKey','expectedRevision']);
  if(!/^[a-f\d]{24}$/.test(payload.goalId||'')||!Number.isFinite(+new Date(payload.dueAt)))bad('An owned goal and deadline are required.');
  return {goalId:payload.goalId,intent:{dueAt:new Date(payload.dueAt),subjectKey:key(payload.subjectKey),confirmedAt:new Date(),evaluationKey:crypto.randomUUID()}};
}
function ensureExpected(record,value){if(!Number.isInteger(value)||value!==(record.revision||0))throw scopeError('Source changed. Reload before saving.',409);}
function sameRetry(existing,record){
  const fields=['domain','observationType','value','occurredAt','sourceId','source','sleep','stress','energy','mood','symptoms','notes','event'];
  const normalized=x=>Object.fromEntries(fields.filter(k=>x[k]!==undefined).map(k=>[k,k==='occurredAt'?new Date(x[k]).toISOString():x[k]]));
  // Compare submitted fields only; server defaults do not turn an exact retry into a conflict.
  const before=Object.fromEntries(Object.keys(normalized(record)).map(k=>[k,normalized(existing)[k]]));
  return stable(before)===stable(normalized(record));
}
module.exports={eventData,observationMetadata,intentData,ensureExpected,sameRetry};
