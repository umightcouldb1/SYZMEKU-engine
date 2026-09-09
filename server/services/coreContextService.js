const mongoose = require('mongoose');
const { requireCoreScope, rejectOwnerFields, scopeError, invalidateCoreRuntime } = require('./coreScopeService');
const { getRequestContext, runWithRequestContext } = require('../utils/requestContext');
const LifeContext = require('../models/LifeContext');
const User = require('../models/User');
const Memory = require('../models/Memory');
const StrategicMemory = require('../models/StrategicMemory');
const SignalEntry = require('../models/SignalEntry');
const Task = require('../models/Task');

// All M1 multi-record context mutations are atomic. No nontransactional fallback:
// a replica set/transaction-capable Mongo deployment is a rollout prerequisite.
mongoose.set('transactionAsyncLocalStorage', true);
const text = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const list = (v, max = 50) => {
  if (!Array.isArray(v) || v.length > max) throw scopeError('Expected a bounded array.', 400);
  return v;
};
const conflict = () => scopeError('Context changed. Reload before saving this result.', 409);
const FIELDS = ['preferredName','lifeStage','mentorStyle','narrative','supportAreas','values','goals','constraints','resources','obligations','relationships','primary_focus','stress_level','current_challenges','legacyIntake'];

async function getContext() {
  const { userId } = requireCoreScope();
  const [life, user] = await Promise.all([
    LifeContext.findOne({ user_id: userId }).lean(),
    User.findById(userId).select('onboarding').lean(),
  ]);
  if (!user) throw scopeError('Account is unavailable.', 404);
  if (life?.legacySuppressedAt) return { ...life, authority: 'LifeContext' };
  // Read-only compatibility projection: never backfill or claim legacy rows on read.
  const p = user.onboarding?.profile || {};
  return {
    ...life, revision: life?.revision || 0, authority: 'legacy_projection',
    preferredName: p.preferredName || '', lifeStage: p.lifeStage || '', mentorStyle: p.mentorStyle || 'gentle',
    narrative: p.sovereignMatrixNote || p.onboardingReflection || '',
    supportAreas: (p.supportAreas || []).filter(area => !(p.goals || []).includes(area)), values: [],
    goals: (p.goals || []).map(description => ({ description, domain:'life', successMeasure:'', confirmed:true, source:'legacy-onboarding', status:'active' })),
    constraints: [], resources: [], obligations: [], relationships: [],
  };
}

async function anchorContext() {
  const { userId } = requireCoreScope();
  let life = await LifeContext.findOne({ user_id: userId });
  if (life?.legacySuppressedAt) return life;
  const projected = await getContext();
  if (!life) life = new LifeContext({ user_id: userId });
  for (const key of FIELDS) if (projected[key] !== undefined) life.set(key, projected[key]);
  life.legacySuppressedAt = new Date();
  return life;
}

async function withContextMutation(callback) {
  requireCoreScope();
  require('./coreScopeService').requireCoreWrite();
  if (getRequestContext().coreTransaction) return callback(await anchorContext());
  for (const [model, key] of [[LifeContext, 'user_id'], [Memory, 'userId']]) {
    const indexes = await model.collection.indexes().catch(() => []);
    if (!indexes.some(index => index.unique && Object.keys(index.key).length === 1 && index.key[key] === 1)) {
      throw scopeError('Required existing context ownership indexes must be verified before enabling writes.', 503);
    }
  }
  return mongoose.connection.transaction(async () => runWithRequestContext(
    { ...getRequestContext(), coreTransaction:true }, async () => {
      const life = await anchorContext();
      // Writing the anchor serializes privacy changes with in-flight model/kernel writes.
      life.writeSequence = (life.writeSequence || 0) + 1;
      await life.save();
      return callback(life);
    }
  ));
}

function sanitizeContext(payload, current = {}) {
  rejectOwnerFields(payload);
  const allowed = new Set([...FIELDS.filter(k=>k!=='legacyIntake'), 'expectedRevision']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw scopeError('Unsupported context field.', 400);
  const result = {};
  for (const key of ['preferredName','lifeStage','mentorStyle','narrative','primary_focus']) if (payload[key] !== undefined) result[key] = text(payload[key], key === 'narrative' ? 6000 : 500);
  for (const key of ['supportAreas','values','current_challenges']) if (payload[key] !== undefined) result[key] = list(payload[key]).map(v => text(v)).filter(Boolean);
  if (payload.stress_level !== undefined) result.stress_level = payload.stress_level;
  for (const key of ['goals','constraints','resources','obligations','relationships']) {
    if (payload[key] === undefined) continue;
    const ids = new Set((current[key] || []).map(v => String(v._id)));
    result[key] = list(payload[key]).map(raw => {
      const item = typeof raw === 'string' ? {description:raw} : raw;
      if (!item || typeof item !== 'object') throw scopeError('Invalid context item.', 400);
      rejectOwnerFields(item);
      if (item._id && !ids.has(String(item._id))) throw scopeError('Context item does not belong to this record.', 404);
      const entry = { ...(item._id ? {_id:item._id} : {}), description:text(item.description), source:'user' };
      if (!entry.description) throw scopeError('Context item description is required.', 400);
      if (key === 'goals') Object.assign(entry,{domain:text(item.domain || 'life',80),successMeasure:text(item.successMeasure || '',1000),status:item.status || 'active',confirmed:true,...(item.targetDate ? {targetDate:item.targetDate} : {})});
      else Object.assign(entry,{kind:text(item.kind || 'general',80),hard:item.hard === true,...(item.validUntil ? {validUntil:item.validUntil} : {})});
      return entry;
    });
  }
  return result;
}

async function invalidateDerived({ conversation = true } = {}) {
  // Retain execution identities and timestamps, redact payloads that could repeat deleted context.
  const changes = {
    KernelSnapshot:{latest_output:null}, KernelCycle:{output:null,error_summary:''},
    ActionExecution:{input:null,result:null,error:''},
    SystemExecution:{signalSnapshot:null,actions:[],riskFlags:[],systemName:'[Context revised]'},
    ProtocolExecutionRecord:{details:'',protocol_name:'[Context revised]'},
  };
  for(const [name,fields] of Object.entries(changes)) await require('../models/'+name).updateMany({},{$set:{...fields,contextInvalidatedAt:new Date()}});
  const Alert=require('../models/AlertRecord');
  for(const alert of await Alert.find()) {
    alert.message='[Context revised]';alert.status='resolved';alert.fingerprint='redacted:'+String(alert._id);alert.contextInvalidatedAt=new Date();await alert.save();
  }
  await StrategicMemory.deleteMany({category:'kernel'});
  await Task.deleteMany({source:{$in:['action-kernel','agent-kernel','recommendation']}});
  if (conversation) await Memory.updateOne({}, { $set:{conversationHistory:[],sovereignContext:{}}, $inc:{revision:1} });
  await require('../models/AgentLoopState').updateMany({}, { $set:{active:false,last_error:'',latest_agent_summary:'',latest_agent_mode:'',latest_agent_next_actions:[]} });
}

async function saveContext(payload, { onboarding = false, legacyIntake } = {}) {
  const result = await withContextMutation(async life => {
    if (payload.expectedRevision !== undefined && Number(payload.expectedRevision) !== life.revision) throw conflict();
    life.set(sanitizeContext(payload, life.toObject()));
    if (legacyIntake !== undefined) life.legacyIntake = legacyIntake;
    // Compatibility metadata never retains a second copy of canonical fields.
    const legacy = {...(life.legacyIntake || {})};
    if (legacy.profile) {legacy.profile={...legacy.profile};delete legacy.profile.preferred_name;}
    if (legacy.life_context) {legacy.life_context={...legacy.life_context};for(const key of ['primary_focus','stress_level','current_challenges','goals','constraints','resources']) delete legacy.life_context[key];}
    life.legacyIntake=legacy;
    life.revision += 1;
    await life.save();
    // Once canonical context is edited, old onboarding text is not a writer or fallback.
    await User.updateOne({_id:requireCoreScope().userId},{$set:{'onboarding.profile':{},...(onboarding ? {'onboarding.completed':true,'onboarding.completedAt':new Date()} : {})}});
    await invalidateDerived();
    return life.toObject();
  });
  invalidateCoreRuntime();
  return result;
}

async function onboardingStatus() {
  const {userId} = requireCoreScope();
  const [user, life] = await Promise.all([User.findById(userId).select('onboarding healthSync name').lean(),getContext()]);
  return {
    completed:Boolean(user?.onboarding?.completed),completedAt:user?.onboarding?.completedAt || null,
    profile:{preferredName:life.preferredName,lifeStage:life.lifeStage,mentorStyle:life.mentorStyle,supportAreas:life.supportAreas || [],goals:(life.goals || []).map(g=>g.description),sovereignMatrixNote:life.narrative || '',onboardingReflection:life.narrative || ''},
    healthSync:user?.healthSync, welcomeName:life.preferredName || user?.name || 'there',
  };
}

async function saveOnboarding(payload) {
  rejectOwnerFields(payload);
  const mapped = {};
  for (const key of ['preferredName','lifeStage','mentorStyle','supportAreas','goals']) if (payload[key] !== undefined) mapped[key] = payload[key];
  if (payload.sovereignMatrixNote !== undefined || payload.onboardingReflection !== undefined) mapped.narrative = payload.sovereignMatrixNote ?? payload.onboardingReflection;
  if (payload.baseline && Object.values(payload.baseline).some(v=>v !== '' && v !== null && v !== undefined)) {
    // Preserve explicitly supplied wellness input; absence is not zero/healthy.
    await ingestObservation({...payload.baseline,source:'onboarding',domain:'wellness'});
  }
  await saveContext(mapped,{onboarding:true});
  return onboardingStatus();
}

async function getConversation() {
  const {userId} = requireCoreScope();
  const [context, memory] = await Promise.all([getContext(),Memory.findOne({userId}).lean()]);
  const sovereignContext={sovereignMatrixNote:context.narrative || '',onboardingReflection:context.narrative || '',lifeStageChoices:context.lifeStage ? [context.lifeStage] : []};
  return {memory:memory || {conversationHistory:[],revision:0},context,sovereignContext,durableMemory:await listMemory()};
}

async function appendConversation(turns, expected) {
  return withContextMutation(async life => {
    const {userId} = requireCoreScope();
    const memory=await Memory.findOne({userId});
    if (life.revision !== expected.contextRevision || (memory?.revision || 0) !== expected.conversationRevision) throw conflict();
    const target=memory || new Memory({userId});
    target.appendConversationTurns(turns);
    target.revision += 1;
    // No second copy of canonical human context is written into conversation storage.
    target.sovereignContext = {};
    await target.save();
    return target.toObject();
  });
}

async function clearConversation() {
  await withContextMutation(async life=>{
    life.revision += 1;await life.save();await invalidateDerived();
    await require('../models/MentorMessage').deleteMany({});
  });
  invalidateCoreRuntime();
}

async function eraseContext() {
  await withContextMutation(async life=>{
    for(const key of FIELDS) life.set(key, Array.isArray(life[key]) ? [] : key==='legacyIntake' ? {} : undefined);
    life.legacySuppressedAt=new Date();life.revision += 1;await life.save();
    await User.updateOne({_id:requireCoreScope().userId},{$set:{'onboarding.profile':{}}});
    await invalidateDerived();
    for(const name of ['StrategicMemory','SignalEntry','Task','System','Protocol','UserProtocolState','MentorProfile','MentorSignal','MentorTask','MentorMessage','LoopStatus','BehavioralRhythm','EmotionalPattern','ColorProfile','SensoryProfile','SymbolicInterest']) await require('../models/'+name).deleteMany({});
  });
  invalidateCoreRuntime();
}

async function ingestObservation(payload) {
  rejectOwnerFields(payload);
  const allowed=['sleep','stress','energy','mood','symptoms','notes','domain','observationType','value','occurredAt','sourceId','source','confirmed','legacyId'];
  const record=Object.fromEntries(allowed.filter(k=>payload[k] !== undefined).map(k=>[k,payload[k]]));
  for(const key of ['sourceId','source','domain','observationType','legacyId']) if(record[key] !== undefined && typeof record[key] !== 'string') throw scopeError('Observation metadata must be text.',400);
  if (JSON.stringify(record).length > 16000) throw scopeError('Observation is too large.',400);
  return withContextMutation(async life=>{
    if(record.sourceId) {
      const existing=await SignalEntry.findOne({sourceId:record.sourceId,source:record.source || 'user'});
      if(existing) return existing;
    }
    const signal=await SignalEntry.create(record);
    life.revision += 1;await life.save();
    return signal;
  });
}

async function listObservations(filter = {}) { requireCoreScope();return SignalEntry.find(filter).sort({createdAt:-1}).limit(250).lean(); }
async function listTasks(filter = {}) { requireCoreScope();return Task.find(filter).sort({createdAt:-1}).limit(250).lean(); }
async function createTask(payload) {
  rejectOwnerFields(payload);
  return withContextMutation(async()=>Task.create({description:text(payload.description || payload.title),title:text(payload.title || '',500),source:text(payload.source || 'user',120),...(payload.protocol_id ? {protocol_id:payload.protocol_id} : {})}));
}
async function completeTask(id) {
  return withContextMutation(async()=>{
    const task=await Task.findById(id);if(!task) throw scopeError('Task not found.',404);
    task.status='done';task.completedAt=new Date();await task.save();return task;
  });
}
async function listMemory(query='') {
  requireCoreScope();const escaped=text(query,200).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return StrategicMemory.find(escaped ? {$or:['title','content','category','tags'].map(k=>({[k]:{$regex:escaped,$options:'i'}}))} : {}).sort({updatedAt:-1}).limit(100).lean();
}
async function saveMemory(payload) {
  rejectOwnerFields(payload);
  return withContextMutation(async()=>StrategicMemory.create({title:text(payload.title || payload.content,80),content:text(payload.content,6000),category:text(payload.category || 'general',80),source:text(payload.source || 'user',120),sourceCommand:text(payload.sourceCommand || '',500),tags:list(payload.tags || []).map(v=>text(v,80)),confirmed:payload.confirmed !== false}));
}
async function changeMemory(id, payload) {
  if(payload) rejectOwnerFields(payload);
  const result=await withContextMutation(async life=>{
    const memory=await StrategicMemory.findById(id);if(!memory) throw scopeError('Memory not found.',404);
    if(payload) {memory.content=text(payload.content,6000);memory.title=text(payload.title || memory.content,80);memory.sourceCommand='';memory.tags=[];memory.confirmed=true;memory.source='user-correction';if(memory.category==='kernel')memory.category='general';memory.revision+=1;await memory.save();}
    else await memory.deleteOne();
    life.revision+=1;await life.save();await invalidateDerived();
    return payload ? memory.toObject() : {deleted:true};
  });
  invalidateCoreRuntime();return result;
}

async function reasoningContext() {
  const [context,latestSignals,latestTasks,strategicMemory,latestSystems] = await Promise.all([getContext(),listObservations(),listTasks(),listMemory(),require('../models/System').find().sort({updatedAt:-1}).limit(10).lean()]);
  return {humanContext:context,latestSignals:latestSignals.slice(0,5),latestTasks:latestTasks.slice(0,10),strategicMemory:strategicMemory.slice(0,10),latestSystems};
}

async function createProtocol(payload) {
  rejectOwnerFields(payload);
  return withContextMutation(()=>require('../models/Protocol').create({name:text(payload.name,200),purpose:text(payload.purpose),trigger_signals:list(payload.trigger_signals || []).map(v=>text(v)),actions:list(payload.actions || []).map(v=>text(v)),escalation_rules:payload.escalation_rules || {}}));
}
async function listProtocols() { requireCoreScope();return require('../models/Protocol').find().lean(); }
async function saveUserProtocol(payload) {
  rejectOwnerFields(payload);
  return withContextMutation(()=>require('../models/UserProtocolState').findOneAndUpdate({protocol_id:payload.protocol_id},{$set:{status:payload.status || 'active',...(payload.started_at ? {started_at:payload.started_at} : {}),...(payload.last_run ? {last_run:payload.last_run} : {})},$setOnInsert:{protocol_id:payload.protocol_id}},{upsert:true,new:true}));
}
async function listUserProtocols() { requireCoreScope();return require('../models/UserProtocolState').find().populate('protocol_id').lean(); }
async function loopStatus() {
  const state=await require('../models/AgentLoopState').findOne({singletonKey:'user:'+requireCoreScope().userId}).lean();
  const runtime=require('./coreScopeService').readCoreRuntime('loop');
  return {active:Boolean(state?.active && runtime?.timer && runtime?.active),last_cycle:state?.last_run_at || null,cycle_count:state?.run_count || 0};
}

module.exports={getContext,saveContext,onboardingStatus,saveOnboarding,getConversation,appendConversation,clearConversation,eraseContext,ingestObservation,listObservations,listTasks,createTask,completeTask,listMemory,saveMemory,changeMemory,reasoningContext,withContextMutation,createProtocol,listProtocols,saveUserProtocol,listUserProtocols,loopStatus};
