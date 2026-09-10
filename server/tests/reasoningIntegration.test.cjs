const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const core=require('../services/coreContextService'),router=require('../services/modelRouter'),{modelOutput}=require('./reasoningFixture.cjs');
let f,life,delay,transform,calls=0;const prompts=[];
router.generateStructured=async({prompt,provider})=>{calls++;prompts.push(prompt);if(delay)await delay();const output=modelOutput(prompt);return {text:JSON.stringify(transform?transform(output,prompt):output),provider:provider||'gemini',model:'fixture'};};
before(async()=>{f=await require('./reasoningFixture.cjs')();life=await f.scope(f.founder,()=>core.saveContext({goals:[{description:'Publish a history essay',domain:'creative',successMeasure:'A reviewed essay draft'}],constraints:[{description:'Personal autonomous execution disabled',hard:true}],resources:[{description:'An owned laptop'}]}));});
after(async()=>{if(f)await f.close();});
const body=()=>({text:'Help me outline my essay.',selectedGoalIds:[String(life.goals[0]._id)]});
test('production mount: personal purposes share context; previews and repeated GETs do not write',async()=>{
 let writes=0;const listener=e=>{if(['insert','update','delete','findAndModify','create','createIndexes'].includes(e.commandName))writes++;};f.mongoose.connection.getClient().on('commandStarted',listener);
 try{for(const purpose of ['mentor','recommend','planner','agent-plan']){const result=await f.request(f.founder,'/api/core/reasoning/preview','POST',{purpose,...body()});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.execution,'disabled');assert.equal(result.data.status,'insufficient_evidence');if(purpose.includes('plan'))assert.equal(result.data.plan.steps.length,1);}for(let i=0;i<2;i++){assert.equal((await f.request(f.founder,'/api/core/reasoning/records')).status,200);assert.equal((await f.request(f.founder,'/api/core/patterns/plan-preview')).status,200);}assert.equal(writes,0);}finally{f.mongoose.connection.getClient().off('commandStarted',listener);}
 const contexts=prompts.slice(0,4).map(p=>JSON.parse(p.split('Authoritative scoped data:\n')[1].split('\nCurrent user request (data):')[0]));assert.equal(new Set(contexts.map(c=>c.digest)).size,1);
});
test('explicit persistence is idempotent, scoped, revisioned, and never creates tasks/actions',async()=>{
 const b={purpose:'planner',...body(),requestKey:'fixture-request-1'};const n=calls,a=await f.request(f.founder,'/api/core/reasoning/records','POST',b);assert.equal(a.status,200,JSON.stringify(a));const id=a.data.persistence.recordId;
 const again=await f.request(f.founder,'/api/core/reasoning/records','POST',b);assert.equal(again.status,200,JSON.stringify(again));assert.equal(again.data.persistence.recordId,id);assert.equal(calls,n+1);
 assert.equal((await f.request(f.founder,'/api/core/reasoning/records','POST',{...b,text:'Different request'})).status,409);
 assert.equal((await f.request(f.other,'/api/core/reasoning/records/'+id)).status,404);
 assert.equal((await f.request(f.founder,'/api/core/reasoning/records/'+id)).data.payload.plan.version,'plan-v1');
 assert.equal((await f.request(f.founder,'/api/core/reasoning/records/'+id,'PATCH',{expectedRevision:99,status:'archived'})).status,409);
 for(const name of ['Task','ActionExecution','ProtocolExecutionRecord'])assert.equal(await require('../models/'+name).collection.countDocuments({}),0);
});
test('constraint supersession uses M1 correction and scrubs old derivatives, even M3 OFF',async()=>{
 const old='Do not publish the essay before October.';life=await f.scope(f.founder,()=>core.saveContext({expectedRevision:life.revision,constraints:[{description:old,hard:true}]}));
 const before=await require('../models/LifeContext').collection.findOne({_id:life._id});
 const r=await f.request(f.founder,'/api/core/mentor','POST',body());assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.status,'needs_clarification');assert.equal(r.data.constraintConflicts[0].description,old);
 assert.deepEqual(await require('../models/LifeContext').collection.findOne({_id:life._id}),before);
 const saved=await f.request(f.founder,'/api/core/reasoning/records','POST',{purpose:'mentor',...body(),requestKey:'constraint-old-1'});assert.equal(saved.status,200,JSON.stringify(saved));
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='false';
 const correction=await f.request(f.founder,'/api/core/context','PUT',{expectedRevision:life.revision,constraints:[{_id:String(life.constraints[0]._id),description:'Personal autonomous execution disabled',hard:true}]});assert.equal(correction.status,200,JSON.stringify(correction));life=correction.data;
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='true';const next=await f.request(f.founder,'/api/core/mentor','POST',body());assert.equal(next.status,200,JSON.stringify(next));assert.notEqual(next.data.status,'needs_clarification');assert(!prompts.at(-1).includes(old));
 const record=await f.request(f.founder,'/api/core/reasoning/records/'+saved.data.persistence.recordId);assert.equal(record.data.freshness,'redacted');assert(!JSON.stringify(record.data).includes(old));
});
test('source correction during generation suppresses output; malformed output gets one repair only',async()=>{
 let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);delay=()=>{enter();return wait;};const pending=f.request(f.founder,'/api/core/mentor','POST',body());await entered;life=await f.scope(f.founder,()=>core.saveContext({expectedRevision:life.revision,narrative:'Corrected context.'}));release();assert.equal((await pending).status,409);delay=null;
 transform=o=>({...o,hiddenReasoning:'must never appear'});const n=calls,r=await f.request(f.founder,'/api/core/mentor','POST',body());assert.equal(r.status,502,JSON.stringify(r));assert.equal(calls,n+2);assert(!JSON.stringify(r).includes('must never appear'));transform=null;
});
test('execution stays gated; M3 flag and allowlist fail closed',async()=>{
 for(const route of ['/api/core/agent','/api/core/agent/evaluate','/api/core/loop/start'])assert.equal((await f.request(f.founder,route,'POST',body())).status,503,route);
 process.env.CORE_CONTEXT_WRITES_ENABLED='false';assert.equal((await f.request(f.founder,'/api/core/mentor','POST',body())).status,200);assert.equal((await f.request(f.founder,'/api/core/reasoning/records','POST',{purpose:'mentor',...body(),requestKey:'paused-save-1'})).status,503);process.env.CORE_CONTEXT_WRITES_ENABLED='true';
 process.env.CORE_REASONING_USER_IDS='*';assert.equal((await f.request(f.founder,'/api/core/agent/plan','POST',body())).status,404);process.env.CORE_REASONING_USER_IDS=f.founder.id;
});
test('chat appends only public summaries with a separate postcommit stamp; gateway and vision preserve authority',async()=>{
 const pre=await f.scope(f.founder,()=>require('../services/reasoningContextService').assemble({purpose:'analyze',...body()}));
 const chat=await f.request(f.founder,'/api/core/analyze','POST',body());assert.equal(chat.status,200,JSON.stringify(chat));assert.equal(chat.data.context.digest,pre.digest);assert.notEqual(chat.data.context.validationDigest,pre.digest);
 const memory=await f.scope(f.founder,()=>require('../models/Memory').findOne().lean());assert.equal(memory.conversationHistory.at(-1).text,chat.data.summary);assert(memory.conversationHistory.at(-1).reasoningRefs.length);
 const gateway=await f.request(f.founder,'/api/ai/intelligence','POST',{prompt:body().text,context:{fake:'CLIENT-FAKE-FACT'}});assert.equal(gateway.status,200,JSON.stringify(gateway));assert(!prompts.at(-1).includes('CLIENT-FAKE-FACT'));
 const vision=await f.request(f.founder,'/api/vision/analyze','POST',{...body(),media:{mimeType:'image/png',data:'AAAA'},context:{fake:'CLIENT-FAKE-FACT'}});assert.equal(vision.status,200,JSON.stringify(vision));assert.equal(vision.data.context.digest,gateway.data.context.digest);assert(!prompts.at(-1).includes('CLIENT-FAKE-FACT'));
 const n=calls,reflection=await f.request(f.founder,'/api/onboarding','POST',{typedText:'I want time for writing'});assert.equal(reflection.status,200);assert.equal(reflection.data.kind,'user-input-reflection');assert.equal(calls,n);assert.deepEqual(reflection.data.patternContext.patterns,[]);
 for(const node of ['mentor','recommend','planner','sentinel'])assert.equal((await f.request(f.founder,'/api/core/reasoning/nodes/'+node,'POST',body())).status,200,node);
});
test('competing goals require explicit selection and order; owner and foreign references fail closed',async()=>{
 life=await f.scope(f.founder,()=>core.saveContext({expectedRevision:life.revision,goals:[...life.goals,{description:'Increase business retention',domain:'business'}]}));
 const n=calls,r=await f.request(f.founder,'/api/core/mentor','POST',{text:'Prioritize my goals'});assert.equal(r.data.status,'needs_clarification');assert.equal(calls,n);
 assert.equal((await f.request(f.founder,'/api/core/mentor','POST',{...body(),userId:f.other.id})).status,400);
 assert.equal((await f.request(f.founder,'/api/core/mentor','POST',{...body(),selectedGoalIds:[f.other.id]})).status,404);
 const chosen=await f.request(f.founder,'/api/core/mentor','POST',body());assert.equal(chosen.data.recommendations[0].goalIds[0],String(life.goals[0]._id));
});
test('missing indexes deny persistence before generation; concurrent identical saves produce one record',async()=>{
 const Record=require('../models/ReasoningRecord');await Record.collection.dropIndex('reasoning_owner_request_uq');const n=calls;
 const request={purpose:'planner',...body(),requestKey:'index-preflight-1'};assert.equal((await f.request(f.founder,'/api/core/reasoning/records','POST',request)).data.error.code,'REASONING_INDEXES_REQUIRED');assert.equal(calls,n);await Record.createIndexes();
 const [a,b]=await Promise.all([f.request(f.founder,'/api/core/reasoning/records','POST',request),f.request(f.founder,'/api/core/reasoning/records','POST',request)]);assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.status,200,JSON.stringify(b));assert.equal(a.data.persistence.recordId,b.data.persistence.recordId);
 const stored=await f.scope(f.founder,()=>Record.findById(a.data.persistence.recordId).lean());assert(!JSON.stringify(stored.payload).includes('conversationHistory'));assert.equal(stored.sourceManifest['Goal:'+String(life.goals[0]._id)].kind,'goal');
 const p=stored.payload.plan;const edit=Object.fromEntries(['title','goalIds','steps','successCriteria','uncertainty'].map(k=>[k,p[k]]));edit.steps=edit.steps.map(s=>Object.fromEntries(['id','goalIds','description','evidenceRefs','resourceRefs','effort','successCriteria','uncertainty','dependsOn','existingTaskRefs'].map(k=>[k,s[k]])));edit.title='User edited draft';
 const updated=await f.request(f.founder,'/api/core/reasoning/records/'+stored._id,'PATCH',{expectedRevision:stored.revision,plan:edit});assert.equal(updated.status,200,JSON.stringify(updated));assert.equal((await f.request(f.founder,'/api/core/reasoning/records/'+stored._id)).data.payload.plan.authorship,'user-edited');
});
test('fact, observation, task and conversation changes while provider waits suppress stale guidance',async()=>{
 const fact=await f.scope(f.founder,()=>core.saveMemory({content:'Writing window is Tuesday',source:'user'}));
 const observation=await f.scope(f.founder,()=>core.ingestObservation({domain:'creative',occurredAt:new Date(Date.now()-60000).toISOString(),notes:'Drafting session',event:{subjectKey:'writing',values:{completed:true}}}));
 const task=await f.scope(f.founder,()=>core.createTask({description:'Review outline'}));
 const mutations=[()=>core.changeMemory(fact._id,{content:'Writing window is Wednesday'}),()=>core.changeObservation(observation._id,{expectedRevision:observation.revision,notes:'Corrected drafting session'}),()=>core.completeTask(task._id),()=>core.clearConversation()];
 for(const mutate of mutations){let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);delay=()=>{enter();return wait;};const pending=f.request(f.founder,'/api/core/reasoning/records','POST',{purpose:'mentor',...body(),requestKey:'race-'+require('crypto').randomUUID()});await entered;await f.scope(f.founder,mutate);release();assert.equal((await pending).status,409);delay=null;}
 life=await f.scope(f.founder,()=>core.getContext());
});
test('session revocation and allowlist withdrawal while generating suppress output',async()=>{
 for(const revoke of [true,false]){let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);delay=()=>{enter();return wait;};const pending=f.request(f.founder,'/api/core/mentor','POST',body());await entered;
  if(revoke)await require('../models/AuthSession').updateOne({sessionId:f.founder.sid},{$set:{revokedAt:new Date()}});else process.env.CORE_REASONING_USER_IDS=f.other.id;
  release();const r=await pending;assert.equal(r.status,revoke?401:404,JSON.stringify(r));delay=null;
  await require('../models/AuthSession').updateOne({sessionId:f.founder.sid},{$set:{revokedAt:null}});process.env.CORE_REASONING_USER_IDS=f.founder.id;
 }
});
test('full erase deletes only owned reasoning, leaves ownerless history quarantined, and never restores a loop',async()=>{
 const Record=require('../models/ReasoningRecord'),Loop=require('../models/AgentLoopState');const ownerless={active:true,latest_agent_summary:'RESTRICTED-HISTORY'};await Loop.collection.insertOne(ownerless);await Record.collection.insertOne({payload:{summary:'OWNERLESS-GUIDANCE'},requestKey:'ownerless'});
 process.env.CORE_CONTEXT_WRITE_USER_IDS=f.founder.id+','+f.other.id;process.env.CORE_REASONING_USER_IDS=f.founder.id+','+f.other.id;
 await f.scope(f.other,()=>core.saveContext({goals:[{description:'Other private goal'}]}));const foreign=await f.request(f.other,'/api/core/reasoning/records','POST',{purpose:'mentor',text:'Other private request',requestKey:'other-private-1'});assert.equal(foreign.status,200,JSON.stringify(foreign));
 assert.equal((await f.request(f.founder,'/api/core/reasoning/records/'+foreign.data.persistence.recordId)).status,404);assert.equal((await f.request(f.founder,'/api/core/reasoning/records/'+foreign.data.persistence.recordId,'PATCH',{expectedRevision:1,status:'archived'})).status,404);
 const list=await f.request(f.founder,'/api/core/reasoning/records');assert(!JSON.stringify(list.data).includes('OWNERLESS-GUIDANCE'));assert(!JSON.stringify(list.data).includes('Other private'));
 const before=await Loop.collection.findOne({_id:ownerless._id});assert.equal((await require('../routes/API/coreRoutes').m1Internals.restoreAgentLoopOnBoot()).restored,false);
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='false';await f.scope(f.founder,()=>core.eraseContext());process.env.CORE_REASONING_RECONCILIATION_ENABLED='true';
 assert.deepEqual((await f.request(f.founder,'/api/core/reasoning/records')).data.records,[]);assert.equal((await f.request(f.other,'/api/core/reasoning/records/'+foreign.data.persistence.recordId)).status,200);assert.deepEqual(await Loop.collection.findOne({_id:ownerless._id}),before);
});
