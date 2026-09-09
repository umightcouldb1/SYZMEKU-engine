const {test,before,after}=require('node:test'),assert=require('node:assert/strict');let f,p;
const root='/api/core/patterns',rule={family:'recurrence',domain:'business',subjectKey:'writing',outcome:{key:'completed',op:'eq',value:true}};
before(async()=>{f=await require('./patternFixture.cjs')();await f.request(f.founder,root+'/evaluate','POST',{rules:[rule]});p=(await f.request(f.founder,root+'?state=candidate')).data.patterns[0];});after(async()=>{if(f)await f.close();});
test('insufficient hypothesis persists across distinct authenticated sessions without event fabrication',async()=>{
 assert.equal(p.confidence,'insufficient');assert.equal(p.counts.supportingUnits,0);
 const sid='another-founder-session';await require('../models/AuthSession').create({userId:f.founder.id,sessionId:sid,expiresAt:new Date(Date.now()+600000)});
 const next={...f.founder,sid,token:require('jsonwebtoken').sign({id:f.founder.id,sid},process.env.JWT_SECRET)};
 assert.equal((await f.request(next,root+'/'+p.id)).data.id,p.id);assert.equal(await require('../models/SignalEntry').collection.countDocuments({}),0);
});
test('feedback uses optimistic revisions and request identities; agreement never adds votes',async()=>{
 let r=await f.request(f.founder,root+'/'+p.id+'/feedback','POST',{action:'agree',expectedRevision:p.revision,requestId:'lifecycle-agree'});assert.equal(r.status,200);let latest=await f.request(f.founder,root+'/'+p.id);assert.equal(latest.data.counts.supportingUnits,0);
 assert.equal((await f.request(f.founder,root+'/'+p.id+'/feedback','POST',{action:'dismiss',expectedRevision:p.revision,requestId:'stale-feedback'})).status,409);
 assert.equal((await f.request(f.founder,root+'/'+p.id+'/feedback','POST',{action:'dismiss',expectedRevision:p.revision,requestId:'lifecycle-agree'})).status,409);p=latest.data;
});
test('dispute/dismiss/reopen preserve deliberate control and no automatic supported promotion',async()=>{
 for(const [action,state]of [['dispute','disputed'],['dismiss','dismissed'],['reopen','candidate']]){const r=await f.request(f.founder,root+'/'+p.id+'/feedback','POST',{action,expectedRevision:p.revision,requestId:'lifecycle-'+action});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.state,state);p={...p,...r.data};}
 const latest=await f.request(f.founder,root+'/'+p.id);assert.equal(latest.data.freshness,'stale');
});
test('flag withdrawal disables all Pattern output but leaves ordinary Core reads',async()=>{process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='false';assert.equal((await f.request(f.founder,root)).status,404);assert.equal((await f.request(f.founder,'/api/core/context')).status,200);assert.equal((await f.request(f.founder,root+'/evaluate','POST',{})).status,503);process.env.CORE_PATTERN_INTELLIGENCE_ENABLED='true';});
