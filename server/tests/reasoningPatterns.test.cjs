const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
let f,pattern,release,entered,gate;const core=require('../services/coreContextService');
require('../services/modelRouter').generateStructured=async({prompt})=>{if(gate){entered();await gate;}return {text:JSON.stringify(require('./reasoningFixture.cjs').modelOutput(prompt)),provider:'gemini',model:'fixture'};};
before(async()=>{
 f=await require('./reasoningFixture.cjs')();await f.scope(f.founder,()=>core.saveContext({goals:[{description:'Publish a history essay',domain:'creative'}]}));
 for(let i=0;i<3;i++)await f.scope(f.founder,()=>core.ingestObservation({domain:'creative',occurredAt:new Date(Date.now()-(i+1)*86400000).toISOString(),event:{subjectKey:'writing',values:{completed:true}},notes:'Recorded writing block'}));
 const snapshot=await f.scope(f.founder,()=>require('../services/patternEvidenceService').snapshot()),{evaluateRule,semanticKey}=require('../logic/patternRules');
 const rule={family:'recurrence',domain:'creative',subjectKey:'writing',outcome:{key:'completed',op:'eq',value:true}},e=evaluateRule(rule,snapshot.events,{prospectivelyConfirmed:true},Date.now());
 pattern=await f.scope(f.founder,()=>core.withContextMutation(()=>require('../models/Pattern').create({...e,hypothesis:'Writing completion in recorded blocks',domain:'creative',family:'recurrence',hypothesisKey:semanticKey(rule,process.env.PATTERN_HYPOTHESIS_HMAC_KEY),supportingEvidence:e.episodes.flatMap(x=>x.refs),evaluatedSourceEpoch:snapshot.sourceEpoch,evaluatedAt:new Date()}),{evidence:false}));
});after(async()=>{if(f)await f.close();});
const request=()=>f.request(f.founder,'/api/core/mentor','POST',{text:'Help me plan the next writing block'});
test('only current supported active Patterns become claims; tentative, stale, expired, disputed, dismissed and disabled stay absent',async()=>{
 const Model=require('../models/Pattern'),baseline=pattern.toObject();
 const good=await request();assert.equal(good.status,200,JSON.stringify(good));assert.equal(good.data.claims.length,1);assert.equal(good.data.claims[0].confidence,'supported');
 for(const change of [{state:'candidate'},{state:'dismissed'},{state:'disputed'},{confidence:'tentative'},{freshness:'stale'},{validUntil:new Date(Date.now()-1000)}]){
  await Model.collection.updateOne({_id:pattern._id},{$set:{state:baseline.state,confidence:baseline.confidence,freshness:baseline.freshness,validUntil:baseline.validUntil,...change}});
  const r=await request();assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data.claims,[]);assert.equal(r.data.status,'insufficient_evidence');
 }
 await Model.collection.updateOne({_id:pattern._id},{$set:{state:baseline.state,confidence:baseline.confidence,freshness:baseline.freshness,validUntil:baseline.validUntil}});
 process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='false';assert.deepEqual((await request()).data.claims,[]);process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='true';
});
test('Pattern expiry and feedback during generation invalidate the complete response',async()=>{
 const Model=require('../models/Pattern');for(const change of [{validUntil:new Date(Date.now()-1000)},{state:'disputed'}]){
  await Model.collection.updateOne({_id:pattern._id},{$set:{state:'active',freshness:'current',validUntil:new Date(Date.now()+3600000)}});
  const wait=new Promise(r=>entered=r);gate=new Promise(r=>release=r);const pending=request();await wait;
  await Model.collection.updateOne({_id:pattern._id},{$set:change,$inc:{revision:1}});release();const r=await pending;gate=null;assert.equal(r.status,409,JSON.stringify(r));assert(!JSON.stringify(r.data).includes('Writing completion'));
 }
});
