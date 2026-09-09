const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
let f,pattern,signal;const root='/api/core/patterns';
const rules=[{family:'recurrence',domain:'business',subjectKey:'focus-block',conditions:[],outcome:{key:'completed',op:'eq',value:true}}];
before(async()=>{f=await require('./patternFixture.cjs')();});after(async()=>{if(f)await f.close();});
test('capability fails closed for every malformed/empty approval and nonfounder',async()=>{assert.equal((await f.request(null,root)).status,401);for(const ids of ['', '*',f.founder.id+',','COMMANDER_IN_CHIEF']){process.env.CORE_PATTERN_USER_IDS=ids;assert.equal((await f.request(f.founder,root+'/capability')).data.enabled,false);}process.env.CORE_PATTERN_USER_IDS=f.founder.id;assert.equal((await f.request(f.other,root+'/capability')).data.enabled,false);assert.equal((await f.request(f.other,root+'/evaluate','POST',{})).status,503);});
test('no-state GETs and planner preview perform zero database writes',async()=>{
 const writes=[];const listener=e=>{if(['insert','update','delete','findAndModify','create','createIndexes','commitTransaction'].includes(e.commandName))writes.push(e.commandName);};f.mongoose.connection.getClient().on('commandStarted',listener);
 try{for(let i=0;i<3;i++)for(const url of [root,root+'/plan-preview','/api/core/loop/status','/api/core/summary'])assert.equal((await f.request(f.founder,url)).status,200,url);}finally{f.mongoose.connection.getClient().off('commandStarted',listener);}assert.deepEqual(writes,[]);
});
test('canonical non-wellness events deduplicate retries and reject forged provenance',async()=>{
 for(let i=0;i<3;i++){const body={domain:'business',source:'user',sourceId:'pattern-event-'+i,occurredAt:new Date(Date.now()-(i+1)*86400000).toISOString(),event:{subjectKey:'focus-block',values:{completed:true}},notes:'Founder fixture event '+i};const saved=await f.request(f.founder,'/api/core/signals','POST',body);assert.equal(saved.status,200,JSON.stringify(saved));signal=saved.data;assert.equal((await f.request(f.founder,'/api/core/signals','POST',body)).data._id,signal._id);assert.equal((await f.request(f.founder,'/api/core/signals','POST',{...body,notes:'different'})).status,409);}
 assert.equal((await f.request(f.founder,'/api/core/signals','POST',{provenance:{kind:'system_event'},event:{}})).status,400);
});
test('explicit evaluation persists one tentative Pattern, not tasks/actions/facts',async()=>{
 const before=await require('../models/Task').collection.countDocuments({});const r=await f.request(f.founder,root+'/evaluate','POST',{rules});assert.equal(r.status,200,JSON.stringify(r));
 const list=await f.request(f.founder,root+'?state=candidate');assert.equal(list.status,200,JSON.stringify(list));pattern=list.data.patterns[0];assert.equal(pattern.confidence,'tentative');assert.equal(pattern.counts.supportingUnits,3);assert.equal(pattern.contradictoryEvidence.length,0);assert.equal(await require('../models/Task').collection.countDocuments({}),before);
 assert.equal((await f.request(f.founder,root+'/evaluate','POST',{rules})).status,429);
});
test('foreign IDs, evidence pages, model operations and execution remain isolated',async()=>{
 for(const path of [root+'/'+pattern.id,root+'/'+pattern.id+'/evidence'])assert.equal((await f.request(f.other,path)).status,404);
 assert.equal((await f.request(f.other,root+'/'+pattern.id+'/feedback','POST',{action:'dismiss',expectedRevision:1,requestId:'foreign-request'})).status,503);
 assert.equal(await f.scope(f.other,()=>require('../models/Pattern').findById(pattern.id)),null);
 for(const path of ['/loop/start','/agent/evaluate','/systems/run'])assert.equal((await f.request(f.founder,'/api/core'+path,'POST',{text:'execute'})).status,503);
 assert.equal(await require('../models/ActionExecution').collection.countDocuments({}),0);
 await assert.rejects(()=>f.scope(f.founder,()=>require('../models/SignalEntry').updateMany({},{$set:{notes:'bypass'}})),/transaction/);
});
test('agreement adds no evidence; dismiss is idempotent and hides normal guidance',async()=>{
 let r=await f.request(f.founder,root+'/'+pattern.id+'/feedback','POST',{action:'agree',expectedRevision:pattern.revision,requestId:'agreement-one'});assert.equal(r.status,200,JSON.stringify(r));
 const body={action:'dismiss',expectedRevision:r.data.revision,requestId:'dismissal-one'};r=await f.request(f.founder,root+'/'+pattern.id+'/feedback','POST',body);assert.equal(r.data.state,'dismissed');assert.equal((await f.request(f.founder,root+'/'+pattern.id+'/feedback','POST',body)).data.revision,r.data.revision);
 assert.equal((await f.request(f.founder,root)).data.patterns.length,0);const p=await f.request(f.founder,root+'/'+pattern.id);assert.equal(p.data.counts.supportingUnits,3);
});
test('source correction while M2 OFF atomically scrubs pattern text and advances epoch',async()=>{
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='false';const r=await f.request(f.founder,'/api/core/signals/'+signal._id,'PATCH',{expectedRevision:signal.revision,notes:'Corrected evidence',event:{subjectKey:'focus-block',values:{completed:false}}});assert.equal(r.status,200,JSON.stringify(r));signal=r.data;
 const p=await f.scope(f.founder,()=>require('../models/Pattern').findById(pattern.id).lean());assert.equal(p.freshness,'stale');assert.equal(p.rule,null);assert.equal(p.hypothesis,'');assert.equal(p.episodes.length,0);assert.equal(p.supportingEvidence.length,0);assert.equal(p.state,'dismissed');
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='true';const view=await f.request(f.founder,root+'/'+pattern.id);assert.equal(view.data.freshness,'stale');assert.equal(view.data.hypothesis,undefined);assert.equal((await f.request(f.founder,root+'/'+pattern.id+'/evidence')).status,409);
});
test('task intention ownership, correction and repeated completion preserve event identity',async()=>{
 const context=await f.request(f.founder,'/api/core/context','PUT',{goals:[{description:'Finish a portfolio',domain:'business'}]});const g=context.data.goals[0]._id;
 const t=await f.request(f.founder,'/api/core/tasks','POST',{description:'Draft portfolio'});const intent={goalId:g,subjectKey:'focus-block',dueAt:new Date(Date.now()+86400000).toISOString(),expectedRevision:t.data.revision};
 assert.equal((await f.request(f.founder,'/api/core/tasks/'+t.data._id+'/intent','PATCH',{...intent,goalId:f.other.id})).status,404);
 assert.equal((await f.request(f.founder,'/api/core/tasks/'+t.data._id+'/intent','PATCH',intent)).status,200);
 const first=await f.request(f.founder,'/api/core/tasks/'+t.data._id+'/complete','POST');const second=await f.request(f.founder,'/api/core/tasks/'+t.data._id+'/complete','POST');assert.equal(first.data.completedAt,second.data.completedAt);assert.equal(first.data.revision,second.data.revision);
});
test('read contracts reject source changes during a guidance request',async()=>{
 const view=require('../services/patternPresentationService');const stamp=await f.scope(f.founder,()=>view.getPatternContext());await f.scope(f.founder,()=>require('../services/coreContextService').saveMemory({content:'New recorded context'}));await assert.rejects(()=>f.scope(f.founder,()=>view.checkStamp(stamp)),/Evidence changed/);
});
test('full context erasure deletes Pattern and retains no ownerless loop restore',async()=>{
 await require('../models/AgentLoopState').collection.insertOne({singletonKey:'historical',active:true});const before=await require('../models/AgentLoopState').collection.findOne({singletonKey:'historical'});
 assert.equal((await f.request(f.founder,'/api/core/context','DELETE')).status,200);assert.equal(await f.scope(f.founder,()=>require('../models/Pattern').countDocuments()),0);
 const after=await require('../models/AgentLoopState').collection.findOne({singletonKey:'historical'});assert.deepEqual(after,before);assert.equal((await require('../routes/API/coreRoutes').m1Internals.restoreAgentLoopOnBoot()).restored,false);
});
