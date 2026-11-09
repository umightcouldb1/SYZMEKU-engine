const {test}=require('node:test');const assert=require('node:assert/strict');
const {QUESTIONS,PHASES,validatePlan,generatePersonalizedPlan}=require('../services/freedomAuditPlan');
const fixture=require('./freedomAuditPlanFixture.cjs');
const profile=(overrides={})=>({ratings:Object.fromEntries(Object.keys(QUESTIONS).map(k=>[k,[2,3,4,5]])),weakestDomain:'time',win:'Publish a portfolio',drag:'Repeated scheduling',asset:'Design templates',...overrides});
test('two different profiles yield specific evidence-backed six-phase plans',()=>{
 const a=profile(),b=profile({weakestDomain:'money',win:'Track monthly spending',drag:'Scattered receipts',asset:'A spreadsheet'});
 const x=validatePlan(fixture(a),a),y=validatePlan(fixture(b),b);
 assert.notDeepEqual(x.plan,y.plan);assert.match(x.plan[2],/Design templates/);assert.match(y.plan[2],/spreadsheet/);
 PHASES.forEach((p,i)=>assert(x.plan[i].startsWith(p)));
 const html=require('fs').readFileSync(require('path').join(__dirname,'../../freedom-audit/index.html'),'utf8');
 const ui=require('vm').runInNewContext('('+html.match(/const domains = (\{[\s\S]*?\n    \});/)[1]+')');
 assert.deepEqual(JSON.parse(JSON.stringify(ui)),QUESTIONS);
});
test('reject malformed, ungrounded, unsafe, oversized and incorrectly ordered plans',()=>{
 for(const mutate of [p=>p.plan.pop(),p=>p.plan[0].phase='Days 1-30',p=>p.plan[0].checkpoint='',p=>p.plan[0].evidence[0].quote='invented income',p=>p.plan[0].evidence[0].id='unknown',p=>p.moves.push('Extra move'),p=>p.priority='x'.repeat(501),p=>p.priority='Stop taking medication today',p=>p.priority='<script>run()</script>',p=>p.extra='extra',p=>p.plan[0].action=p.plan[1].action,p=>p.plan.forEach(q=>q.evidence=[{id:'time.1',quote:require('../services/freedomAuditPlan').evidenceFor(profile())['time.1']}])]) {
 const p=fixture(profile());mutate(p);assert.throws(()=>validatePlan(p,profile()));
 }
});
test('provider request has question evidence; failures and cancellations are sanitized',async()=>{
 delete process.env.FREEDOM_AUDIT_AI_TEST_MODE;
 const provider=require('../services/reasoningProviderService'),original=provider.generate;
 try {
  provider.generate=async({prompt,signal,responseSchema,maxOutputTokens,thinkingBudget})=>{assert.match(prompt,/calendar reflects my priorities/);assert.match(prompt,/untrusted evidence/);assert.equal(responseSchema.properties.plan.minItems,6);assert.equal(maxOutputTokens,6144);assert.equal(thinkingBudget,512);return {text:JSON.stringify(fixture(profile())),model:'fake',finishReason:'STOP'};};
  assert.equal((await generatePersonalizedPlan(profile())).providerModel,'fake');
  for(const statusCode of [429,503,504,502]){
   provider.generate=async()=>{throw Object.assign(new Error('secret private customer text'),{statusCode,retryAfterSeconds:5});};
   await assert.rejects(generatePersonalizedPlan(profile()),e=>e.statusCode===statusCode&&!e.message.includes('secret'));
  }
  provider.generate=async()=>({text:'not-json'});await assert.rejects(generatePersonalizedPlan(profile()),e=>e.statusCode===502);
  provider.generate=async()=>({text:JSON.stringify(fixture(profile())),finishReason:'MAX_TOKENS'});await assert.rejects(generatePersonalizedPlan(profile()),e=>e.statusCode===502);
  provider.generate=async()=>({text:JSON.stringify(fixture(profile()))});const abort=new AbortController();abort.abort();
  await assert.rejects(generatePersonalizedPlan(profile(),{signal:abort.signal}),e=>e.statusCode===504);
 } finally {provider.generate=original;}
});
test('missing Gemini configuration fails closed without an outbound request',async()=>{
 const aliases=['GEMINI_API_KEY','Gemini_API_Key','Gemini_API_KEY','FREEDOM_AUDIT_AI_TEST_MODE'];const old=Object.fromEntries(aliases.map(k=>[k,process.env[k]]));aliases.forEach(k=>delete process.env[k]);
 try {await assert.rejects(generatePersonalizedPlan(profile()),e=>e.statusCode===503&&e.message.includes('no new result was saved'));}
 finally {for(const k of aliases){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});

test('constrained and sparse intake reaches the provider intact with feasibility safeguards and unchanged output contract',async()=>{
 delete process.env.FREEDOM_AUDIT_AI_TEST_MODE;
 const provider=require('../services/reasoningProviderService'),original=provider.generate;
 const cases=[
  profile({win:'Show three existing portfolio pieces to five prospects.',drag:'Four hours total per week in unpredictable 20-minute gaps while caregiving. No spare money or available helper.',asset:'Six unfinished drafts and free design software.'}),
  profile({win:'the 30-day outcome I choose',drag:'my highest-friction unfinished task',asset:'my strongest underused asset'}),
  profile({win:'Finish one household budget draft.',drag:'Only one 30-minute window this week; essential care cannot be moved.',asset:'An existing spreadsheet; a friend has explicitly agreed to review it once.'})
 ];
 try {
  for(const a of cases){
   let calls=0;
   provider.generate=async request=>{
    calls++;const {prompt}=request;
    const assessment=JSON.parse(prompt.split('ASSESSMENT DATA: ')[1].split('\nEVIDENCE MAP: ')[0]);
    const evidence=JSON.parse(prompt.split('EVIDENCE MAP: ')[1]);
    assert.deepEqual(assessment,a);assert.equal(evidence.drag,a.drag);assert.equal(evidence.asset,a.asset);
    assert.match(prompt,/Total available hours do not imply uninterrupted blocks/);
    assert.match(prompt,/When capacity is unknown, propose checking one realistic work window/);
    assert.match(prompt,/Do not assume spare money, paid tools or a willing helper/);
    assert.match(prompt,/delegation conditional on confirmed help, with a self-managed or rescheduling alternative/);
    assert.match(prompt,/Do not remove essential care or obligations/);
    assert.match(prompt,/Missing personal details remain unknown/);
    assert.match(prompt,/OPTIMIZE should use feedback from that trial/);
    assert.match(prompt,/customer-controlled completion or observations, not guaranteed replies, sales or protected time/);
    assert.equal(request.maxOutputTokens,6144);assert.equal(request.thinkingBudget,512);
    assert.deepEqual(Object.keys(request.responseSchema.properties).sort(),['compression','moves','plan','priority']);
    return {text:JSON.stringify(fixture(a)),model:'contract-fixture',finishReason:'STOP'};
   };
   const result=await generatePersonalizedPlan(a);assert.equal(calls,1);assert.equal(result.plan.length,6);
   assert.deepEqual(result, {...validatePlan(fixture(a),a),providerModel:'contract-fixture'});
  }
 }finally{provider.generate=original;}
});
