const core = require('./coreContextService');
const { rejectOwnerFields, scopeError } = require('./coreScopeService');

const GROUPS = ['profile','life_context','behavioral_rhythm','emotional_patterns','color_profile','sensory_profile','symbolic_interests'];
async function getIntake() {
  const context=await core.getContext();
  return {...(context.legacyIntake || {}),profile:{...(context.legacyIntake?.profile || {}),preferred_name:context.preferredName},life_context:{primary_focus:context.primary_focus,current_challenges:context.current_challenges || [],goals:context.goals || [],constraints:context.constraints || [],resources:context.resources || []}};
}
async function saveIntake(payload) {
  rejectOwnerFields(payload);
  if(Object.keys(payload).some(k=>!GROUPS.includes(k))) throw scopeError('Unsupported intake section.',400);
  const existing=await core.getContext();
  const legacyIntake={...(existing.legacyIntake || {})};
  for(const key of GROUPS) if(payload[key] !== undefined) {
    if(!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])) throw scopeError('Invalid intake section.',400);
    rejectOwnerFields(payload[key]);
    if(JSON.stringify(payload[key]).length>8000) throw scopeError('Intake section is too large.',400);
    legacyIntake[key]=payload[key];
  }
  const context={expectedRevision:existing.revision};
  if(payload.profile?.preferred_name !== undefined) context.preferredName=payload.profile.preferred_name;
  for(const key of ['primary_focus','stress_level','current_challenges','goals','constraints','resources']) if(payload.life_context?.[key]!==undefined) context[key]=payload.life_context[key];
  await core.saveContext(context,{legacyIntake});return getIntake();
}
const taskView = task => ({...task,user_id:task.userId,title:task.title || task.description,status:task.status==='done'?'complete':'pending',completed_at:task.completedAt});
async function createTask(payload) {const task=await core.createTask({...payload,source:'mentor-compatibility'});return taskView(task.toObject());}
async function tasks(status) {return (await core.listTasks(status ? {status:status==='complete'?'done':'open'} : {})).map(taskView);}
async function signal(payload) {
  rejectOwnerFields(payload);
  const type=String(payload.signal_type || '');
  if(!['stress','sleep','emotion','focus','symptom','environment'].includes(type) || typeof payload.value!=='number' || !Number.isFinite(payload.value)) throw scopeError('Invalid legacy signal.',400);
  const entry=await core.ingestObservation({domain:'wellness',observationType:type,value:payload.value,source:'mentor-compatibility',occurredAt:payload.recorded_at,...(['stress','sleep'].includes(type)?{[type]:payload.value}:{}),notes:JSON.stringify(payload.metadata || {}).slice(0,2000)});
  return signalView(entry.toObject());
}
const signalView = entry => ({...entry,user_id:entry.userId,signal_type:entry.observationType,value:entry.value,recorded_at:entry.occurredAt,metadata:{source:entry.source}});
async function signals(type) {return (await core.listObservations(type ? {observationType:type} : {})).map(signalView);}
async function message(payload) {
  if(!['mentor','reflection','insight'].includes(payload.message_type)) throw scopeError('Invalid message type.',400);
  const result=await core.saveMemory({content:payload.content,title:payload.content,category:'legacy-'+payload.message_type,source:'mentor-compatibility',confirmed:false});
  return messageView(result.toObject());
}
const messageView = entry => ({...entry,user_id:entry.userId,message_type:entry.category.replace('legacy-',''),created_at:entry.createdAt});
async function messages() {return (await core.listMemory()).filter(m=>['legacy-mentor','legacy-reflection','legacy-insight'].includes(m.category)).map(messageView);}
module.exports={getIntake,saveIntake,createTask,tasks,signal,signals,message,messages};
