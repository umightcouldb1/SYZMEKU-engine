const mongoose=require('mongoose');
const {requireCoreScope,scopeError}=require('./coreScopeService');
const {DAY,METHODS}=require('../logic/patternRules');
const LifeContext=require('../models/LifeContext');
const Signal=require('../models/SignalEntry');
const Task=require('../models/Task');
const Pattern=require('../models/Pattern');
async function epoch(){requireCoreScope();return (await LifeContext.findOne().select('patternEvidenceRevision').lean())?.patternEvidenceRevision||0;}
async function assertEpoch(expected){if(await epoch()!==expected)throw scopeError('Evidence changed. Reload before continuing.',409);}
const ref=(authority,doc,root,at)=>({authority,recordId:String(doc._id),sourceRevision:doc.revision||0,originRootKey:root,occurredAt:new Date(at),recordedAt:doc.createdAt});
async function snapshot(now=Date.now()){
  requireCoreScope();
  const session=await mongoose.startSession();let result;
  try {await session.withTransaction(async()=>{
    const life=await LifeContext.findOne().session(session).lean();
    const patterns=await Pattern.find().limit(51).session(session).lean();
    // Keep the discovery window for locked prospective confirmation as well as
    // the current maintenance window. Refuse promotion on overflow.
    const earliest=Math.min(now-METHODS['pattern-rules-v1'].windowDays*DAY,...patterns.filter(p=>p.observationWindow?.discoveryEnd).map(p=>+new Date(p.observationWindow.discoveryEnd)-p.observationWindow.windowDays*DAY));
    const signals=await Signal.find({occurredAt:{$gte:new Date(earliest-DAY),$lte:new Date(now)}}).sort({occurredAt:1,_id:1}).limit(501).session(session).lean();
    const tasks=await Task.find({'intent.dueAt':{$gte:new Date(earliest),$lte:new Date(now)}}).sort({'intent.dueAt':1,_id:1}).limit(501).session(session).lean();
    const events=signals.map(s=>({id:String(s._id),root:s.provenance?.originRootKey,at:+new Date(s.occurredAt),recordedAt:+new Date(s.createdAt),eligible:s.provenance?.kind==='user_event'&&Boolean(s.event?.subjectKey)&&s.revision>=1,
      domain:s.domain,subject:s.event?.subjectKey,values:s.event?.values||{},unit:s.event?.unit,phase:s.event?.phase,interventionKey:s.event?.interventionKey,taskRef:s.event?.taskRef,
      coverage:s.event?.coverage?{start:+new Date(s.event.coverage.start),end:+new Date(s.event.coverage.end),complete:s.event.coverage.complete}:null,ref:ref('SignalEntry',s,s.provenance?.originRootKey,s.occurredAt)}));
    for(const t of tasks){
      const goal=life?.goals?.find(g=>String(g._id)===String(t.goalId));
      const root='task:'+String(t._id);
      events.push({id:String(t._id),root,at:+new Date(t.intent.dueAt),recordedAt:+new Date(t.intent.confirmedAt),eligible:Boolean(goal&&t.intent.confirmedAt&&t.intent.confirmedAt<=t.intent.dueAt),domain:goal?.domain,subject:t.intent.subjectKey,values:{},task:true,goalId:String(t.goalId),dueAt:+new Date(t.intent.dueAt),completedAt:t.completedAt?+new Date(t.completedAt):null,ref:ref('Task',t,root,t.intent.dueAt)});
    }
    result={sourceEpoch:life?.patternEvidenceRevision||0,life,patterns,events,complete:signals.length+tasks.length<=500&&patterns.length<=50};
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});}finally{await session.endSession();}
  return result;
}
async function resolveRefs(refs){
  const result=[];
  for(const r of refs){
    // Only canonical events and explicit task intentions earn evidence credit.
    const model=r.authority==='SignalEntry'?Signal:r.authority==='Task'?Task:null;
    if(!model)throw scopeError('Evidence is unavailable.',409);
    if(!/^[a-f\d]{24}$/i.test(r.recordId))throw scopeError('Evidence is unavailable.',409);
    const doc=await model.findById(r.recordId).lean();
    if(!doc||(doc.revision||0)!==r.sourceRevision)throw scopeError('Evidence changed. Reevaluate this pattern.',409);
    result.push({...r,excerpt:r.authority==='Task'?doc.description:doc.notes||JSON.stringify(doc.event?.values||{}),source:r.authority==='Task'?'Explicit task intention':'Self-reported observation'});
  }
  return result;
}
const INDEXES=[
  {model:'Pattern',name:'pattern_owner_hypothesis_uq',key:{userId:1,hypothesisKey:1},unique:true},
  {model:'Pattern',name:'pattern_owner_state_updated',key:{userId:1,state:1,updatedAt:-1}},
  {model:'SignalEntry',name:'pattern_signal_owner_time',key:{userId:1,occurredAt:1,_id:1}},
  {model:'Task',name:'pattern_task_owner_due',key:{userId:1,'intent.dueAt':1,_id:1}},
];
async function prerequisites(){
  const results=[];
  for(const spec of INDEXES){const indexes=await require('../models/'+spec.model).collection.indexes().catch(()=>[]);results.push({name:spec.name,present:indexes.some(i=>i.name===spec.name&&JSON.stringify(i.key)===JSON.stringify(spec.key)&&Boolean(i.unique)===Boolean(spec.unique))});}
  if(results.some(i=>!i.present))throw scopeError('Pattern indexes must be provisioned and verified before evaluation.',503);
  return results;
}
module.exports={snapshot,epoch,assertEpoch,resolveRefs,prerequisites,INDEXES};
