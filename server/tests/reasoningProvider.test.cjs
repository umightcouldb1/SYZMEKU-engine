const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const provider=require('../services/reasoningProviderService'),contracts=require('../contracts/reasoningContracts'),policy=require('../logic/reasoningPolicy');
const originalFetch=global.fetch,originalEnv={...process.env};
afterEach(()=>{global.fetch=originalFetch;for(const k of Object.keys(process.env))if(!Object.hasOwn(originalEnv,k))delete process.env[k];Object.assign(process.env,originalEnv);});
function reset(){for(const k of ['GEMINI_API_KEY','Gemini_API_Key','Gemini_API_KEY'])delete process.env[k];}
test('central credential aliases, conflicting aliases and purpose models',()=>{
 for(const alias of ['GEMINI_API_KEY','Gemini_API_Key','Gemini_API_KEY']){reset();process.env[alias]='fixture-only';assert.equal(provider.configuration('mentor').key,'fixture-only');}
 process.env.GEMINI_API_KEY='different-fixture';assert.throws(()=>provider.configuration('mentor','gemini',{GEMINI_API_KEY:'one',Gemini_API_Key:'two'}),e=>e.code==='MODEL_CONFIG_CONFLICT'&&!e.message.includes('fixture'));
 reset();assert.throws(()=>provider.configuration('mentor'),e=>e.code==='MODEL_NOT_CONFIGURED');process.env.GEMINI_API_KEY='fixture';process.env.STRATEGIC_MODEL='fixture-plan-model';assert.equal(provider.configuration('planner').model,'fixture-plan-model');
});
test('provider status, body redaction, quota metadata and no retry/fallback',async()=>{
 reset();process.env.GEMINI_API_KEY='fixture';
 for(const [status,expected,code] of [[401,503,'MODEL_CREDENTIAL_REJECTED'],[403,503,'MODEL_CREDENTIAL_REJECTED'],[429,429,'MODEL_RATE_LIMITED'],[500,502,'MODEL_UPSTREAM_ERROR']]){
  let calls=0;global.fetch=async()=>{calls++;return new Response('SECRET-BODY-DO-NOT-EXPOSE',{status,headers:{'retry-after':'999'}});};
  await assert.rejects(()=>provider.generate({purpose:'mentor',prompt:'private fixture',signal:AbortSignal.timeout(1000)}),e=>e.statusCode===expected&&e.code===code&&!e.message.includes('SECRET')&&(status!==429||e.retryAfterSeconds===300));assert.equal(calls,1);
 }
});
test('timeout, local-only refusal, bounded body and hidden provider thoughts',async()=>{
 reset();process.env.GEMINI_API_KEY='fixture';let urls=[];global.fetch=async url=>{urls.push(url);throw Error('secret upstream details');};
 await assert.rejects(()=>provider.generate({purpose:'mentor',prompt:'private',provider:'ollama'}),e=>e.statusCode===503&&!e.message.includes('secret'));assert.equal(urls.length,1);assert(!urls[0].includes('google'));
 await assert.rejects(()=>provider.generate({purpose:'mentor',prompt:'private',signal:AbortSignal.abort()}),e=>e.statusCode===504);
 global.fetch=async()=>new Response('x'.repeat(262145));await assert.rejects(()=>provider.generate({purpose:'mentor',prompt:'private'}),e=>e.code==='MODEL_OUTPUT_INVALID');
 global.fetch=async()=>new Response(null,{status:204});await assert.rejects(()=>provider.generate({purpose:'mentor',prompt:'private'}),e=>e.statusCode===502&&e.code==='MODEL_OUTPUT_INVALID');
 global.fetch=async()=>Response.json({candidates:[{content:{parts:[{thought:true,text:'hidden scratchpad'},{text:'{}'}]}}]});assert.equal((await provider.generate({purpose:'mentor',prompt:'private'})).text,'{}');
});
const goal='000000000000000000000001';
function context(){return {selectedGoalIds:[goal],manifest:{['Goal:'+goal]:{kind:'goal'}},resources:[],outcomes:{actions:[]}};}
function candidate(){return {id:'step-1',goalIds:[goal],description:'Write an outline',evidenceRefs:['Goal:'+goal],resourceRefs:[],effort:{band:'low',basis:'Estimate'},successCriteria:['Outline reviewed'],uncertainty:['Time unknown']};}
test('strict output rejects foreign evidence, goals, cycles, hidden instructions and invented scores',()=>{
 const c=context(),r=candidate(),valid={recommendations:[r],plan:null,questions:[],constraintConflicts:[]};assert.equal(contracts.output(valid,c).recommendations.length,1);
 for(const bad of [{...valid,confidence:.99},{...valid,chainOfThought:'private'},{...valid,recommendations:[{...r,evidenceRefs:['Task:foreign']}]},{...valid,recommendations:[{...r,goalIds:['foreign']}]},{...valid,recommendations:[{...r,score:100}]}])assert.throws(()=>contracts.output(bad,c));
 for(const deps of [['step-1'],['missing']])assert.throws(()=>contracts.plan({title:'Plan',goalIds:[goal],steps:[{...r,dependsOn:deps,existingTaskRefs:[]}],successCriteria:[],uncertainty:[]},c));
 assert.throws(()=>contracts.output({...valid,recommendations:[{...r,effort:{band:'low',basis:'Estimate',durationRangeMinutes:[40,10]}}]},c));
});
test('ordinal ranking respects user goal order despite commercial urgency; failed operations are not human outcomes',()=>{
 const c=context(),g2='000000000000000000000002';c.selectedGoalIds.push(g2);c.manifest.fact={kind:'fact'};c.manifest.failed={kind:'operation-result'};c.outcomes.actions=[{ref:'failed',success:false}];
 const r=candidate(),commercial={...r,id:'sales',goalIds:[g2],description:'Increase retention immediately',evidenceRefs:['fact'],effort:{band:'low',basis:'estimate'}};
 assert.equal(policy.rank([commercial,r],c)[0].id,r.id);assert.equal(policy.rank([{...r,evidenceRefs:['failed']}],c)[0].feasibility,'needs_clarification');
 assert(!JSON.stringify(policy.rank([commercial,r],c)).includes('score'));
});
