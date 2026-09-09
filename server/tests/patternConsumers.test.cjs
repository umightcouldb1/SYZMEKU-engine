const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
let f,p,source,delay=null;const prompts=[];
require('../services/modelRouter').requestModelJson=async({prompt})=>{prompts.push(prompt);if(delay)await delay();return {data:{candidates:[{content:{parts:[{text:JSON.stringify({objectives:['Review the recorded evidence'],constraints:[],risks:[],leverage:[],next_actions:['Record another observation']})}]}}]}};};
before(async()=>{
 f=await require('./patternFixture.cjs')();const core=require('../services/coreContextService'),{evaluateRule,semanticKey}=require('../logic/patternRules');
 for(let i=0;i<3;i++)source=await f.scope(f.founder,()=>core.ingestObservation({domain:'business',occurredAt:new Date(Date.now()-(i+1)*86400000).toISOString(),event:{subjectKey:'writing',values:{completed:true}},notes:'Recorded fixture outcome'}));
 const snapshot=await f.scope(f.founder,()=>require('../services/patternEvidenceService').snapshot());const rule={family:'recurrence',domain:'business',subjectKey:'writing',outcome:{key:'completed',op:'eq',value:true}};
 // Seed a previously-confirmed fixture directly; production cannot set this bit.
 const e=evaluateRule(rule,snapshot.events,{prospectivelyConfirmed:true},Date.now());
 p=await f.scope(f.founder,()=>core.withContextMutation(()=>require('../models/Pattern').create({...e,hypothesis:'Writing completion in recorded blocks',domain:'business',family:'recurrence',hypothesisKey:semanticKey(rule,process.env.PATTERN_HYPOTHESIS_HMAC_KEY),supportingEvidence:e.episodes.flatMap(x=>x.refs),evaluatedSourceEpoch:snapshot.sourceEpoch,evaluatedAt:new Date()}),{evidence:false}));
});after(async()=>{if(f)await f.close();});
test('main lineage, Mentor and Recommend receive the same verified read contract',async()=>{
 for(const route of ['/api/core/analyze','/api/core/mentor','/api/core/recommend']){const result=await f.request(f.founder,route,'POST',{text:'Review my recorded patterns'});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.patternContext.patterns[0].id,String(p._id));assert.equal(result.data.patternContext.patterns[0].counts.supportingUnits,3);}
 assert.equal(prompts.length,3);for(const prompt of prompts)assert(prompt.includes(String(p._id)));
 const stored=await f.scope(f.founder,()=>require('../models/Memory').findOne().lean());assert.equal(stored.conversationHistory.at(-1).patternRefs[0].patternId,String(p._id));
});
test('planning preview reads owned patterns without task or action writes',async()=>{const before=await require('../models/Task').collection.countDocuments({});const result=await f.request(f.founder,'/api/core/patterns/plan-preview');assert.equal(result.status,200);assert.equal(result.data.patternContext.patterns[0].id,String(p._id));assert.equal(await require('../models/Task').collection.countDocuments({}),before);assert.equal(await require('../models/ActionExecution').collection.countDocuments({}),0);});
test('source correction while provider is in flight discards stale output and conversation',async()=>{
 let entered,release;const waiting=new Promise(r=>entered=r);const gate=new Promise(r=>release=r);delay=()=>{entered();return gate;};
 const pending=f.request(f.founder,'/api/core/analyze','POST',{text:'Review a pattern'});await waiting;
 assert.equal((await f.request(f.founder,'/api/core/signals/'+source._id,'PATCH',{expectedRevision:source.revision,notes:'Source corrected during model call'})).status,200);release();const result=await pending;delay=null;
 assert.equal(result.status,409,JSON.stringify(result));const memory=await f.scope(f.founder,()=>require('../models/Memory').findOne().lean());assert.equal(memory.conversationHistory.length,0);
});
