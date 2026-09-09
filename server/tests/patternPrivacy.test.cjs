const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
let f,p,signal;const rule={family:'recurrence',domain:'business',subjectKey:'review',outcome:{key:'completed',op:'eq',value:true}};
before(async()=>{f=await require('./patternFixture.cjs')();for(let i=0;i<3;i++)signal=(await f.request(f.founder,'/api/core/signals','POST',{domain:'business',occurredAt:new Date(Date.now()-(i+1)*86400000).toISOString(),event:{subjectKey:'review',values:{completed:true}}})).data;assert.equal((await f.request(f.founder,'/api/core/patterns/evaluate','POST',{rules:[rule]})).status,200);p=(await f.request(f.founder,'/api/core/patterns?state=candidate')).data.patterns[0];});after(async()=>{if(f)await f.close();});
test('two approved users still cannot access or reference another owner',async()=>{
 process.env.CORE_CONTEXT_WRITE_USER_IDS=[f.founder.id,f.other.id].join(',');process.env.CORE_PATTERN_USER_IDS=process.env.CORE_CONTEXT_WRITE_USER_IDS;
 for(const route of ['/api/core/patterns/'+p.id,'/api/core/patterns/'+p.id+'/evidence'])assert.equal((await f.request(f.other,route)).status,404);
 assert.equal((await f.request(f.other,'/api/core/patterns/'+p.id+'/feedback','POST',{action:'dismiss',expectedRevision:p.revision,requestId:'foreign-feedback'})).status,404);
 assert.equal((await f.request(f.other,'/api/core/signals','POST',{domain:'business',occurredAt:new Date(Date.now()-1000).toISOString(),event:{subjectKey:'review',values:{completed:true},taskRef:signal._id}})).status,404);
 assert.equal((await f.request(f.other,'/api/core/signals/'+signal._id,'DELETE',undefined,{'If-Match':String(signal.revision)})).status,404);
 await assert.rejects(()=>f.scope(f.other,()=>require('../services/coreContextService').withContextMutation(()=>require('../models/Pattern').create({domain:'business',family:'recurrence',hypothesisKey:'foreign-reference',methodVersion:'pattern-rules-v1',rule:require('../logic/patternRules').normalizeRule(rule),supportingEvidence:[{authority:'SignalEntry',recordId:signal._id,sourceRevision:1}]}),{evidence:false})),/accessible/);
});
test('missing scope, revoked session and absent index all fail closed',async()=>{
 await assert.rejects(()=>require('../models/Pattern').find(),/scope/);
 await require('../models/Pattern').collection.dropIndex('pattern_owner_hypothesis_uq');assert.equal((await f.request(f.founder,'/api/core/patterns/evaluate','POST',{rules:[rule]})).status,503);await require('../models/Pattern').createIndexes();
 await require('../models/AuthSession').updateOne({sessionId:f.other.sid},{$set:{revokedAt:new Date()}});assert.equal((await f.request(f.other,'/api/core/patterns')).status,401);
});
test('canonical fact/task writes advance evidence epoch independently of LifeContext revision',async()=>{
 const core=require('../services/coreContextService'),evidence=require('../services/patternEvidenceService');let epoch=await f.scope(f.founder,evidence.epoch);
 await f.scope(f.founder,()=>core.createTask({description:'Explicit task'}));assert.equal(await f.scope(f.founder,evidence.epoch),++epoch);
 await f.scope(f.founder,()=>core.saveMemory({content:'Sourced fixture fact'}));assert.equal(await f.scope(f.founder,evidence.epoch),++epoch);
 assert.equal((await f.request(f.founder,'/api/core/patterns/'+p.id)).data.freshness,'stale');
});
test('source writes cannot use the pattern-only transaction or bypass a paused M2 model gate',async()=>{
 const core=require('../services/coreContextService');await assert.rejects(()=>f.scope(f.founder,()=>core.withContextMutation(()=>require('../models/SignalEntry').updateOne({_id:signal._id},{$set:{notes:'bypass'}}),{evidence:false})),/epoch/);
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='false';try{await assert.rejects(()=>f.scope(f.founder,()=>core.withContextMutation(()=>require('../models/Pattern').updateOne({_id:p.id},{$set:{state:'active'}}),{evidence:false})),/paused/);}finally{process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='true';}
});
test('failed source transaction rolls back canonical edit and invalidation together',async()=>{
 const core=require('../services/coreContextService'),Signal=require('../models/SignalEntry');const before=await f.scope(f.founder,()=>Signal.findById(signal._id).lean());const epoch=await f.scope(f.founder,require('../services/patternEvidenceService').epoch);
 await assert.rejects(()=>f.scope(f.founder,()=>core.withContextMutation(async()=>{await Signal.updateOne({_id:signal._id},{$set:{notes:'Must roll back'}});throw new Error('Injected transaction failure');})),/Injected/);
 assert.deepEqual(await f.scope(f.founder,()=>Signal.findById(signal._id).lean()),before);assert.equal(await f.scope(f.founder,require('../services/patternEvidenceService').epoch),epoch);
});
test('deleted source cannot survive evidence pages or Pattern payloads when feature is off',async()=>{
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='false';assert.equal((await f.request(f.founder,'/api/core/signals/'+signal._id,'DELETE',undefined,{'If-Match':String(signal.revision)})).status,200);
 const raw=await f.scope(f.founder,()=>require('../models/Pattern').findById(p.id).lean());assert.equal(raw.rule,null);assert.equal(raw.episodes.length,0);assert(!JSON.stringify(raw).includes(signal._id));
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='true';assert.equal((await f.request(f.founder,'/api/core/patterns/'+p.id+'/evidence')).status,409);
});
test('read-only repeated stale presentation and no-state reads never initialize data',async()=>{
 const commands=[];const listener=e=>{if(['insert','update','delete','findAndModify','createIndexes','commitTransaction'].includes(e.commandName))commands.push(e.commandName);};f.mongoose.connection.getClient().on('commandStarted',listener);
 try{for(let i=0;i<5;i++)assert.equal((await f.request(f.founder,'/api/core/patterns/'+p.id)).data.freshness,'stale');}finally{f.mongoose.connection.getClient().off('commandStarted',listener);}assert.deepEqual(commands,[]);
});
