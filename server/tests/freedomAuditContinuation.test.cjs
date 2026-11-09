const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const audit=require('../services/freedomAuditContinuation'),core=require('../services/coreContextService'),router=require('../services/modelRouter');
const {modelOutput}=require('./reasoningFixture.cjs');
let f,goal,legacyPrompts=[],m3Prompts=[],delay;
router.requestModelJson=async({prompt})=>{legacyPrompts.push(prompt);if(delay)await delay();return {data:{candidates:[{content:{parts:[{text:JSON.stringify({objectives:['Review the retained plan.'],constraints:[],risks:[],leverage:[],next_actions:['Choose the next saved step.']})}]}}]},model:'synthetic'};};
router.generateStructured=async({prompt})=>{m3Prompts.push(prompt);if(delay)await delay();return {text:JSON.stringify(modelOutput(prompt)),provider:'gemini',model:'synthetic'};};
const endpoint='/api/core/audit-continuation';
function result(id,marker='OWNER_AUDIT') {return {id,score:60,stage:'Stabilize',weakestDomain:'time',highestLeveragePriority:'Protect one planned work session.',domainScores:{time:40,money:60,obligations:60,assets:60,desires:80},leverageMoves:['Choose a task.','Clear one duplicate.','Measure completion.'],compression:{delete:'A duplicate',automate:'A reminder',delegate:'Ask about availability',execute:'One task'},liberationPlan:Array.from({length:6},(_,i)=>`Phase ${i+1}: ${marker} exact action and checkpoint ${i+1}.`),analysisMethod:'Synthetic generated proposals, not verified facts.',inputs:{ratings:{time:[2,2,2,2]},win:'Complete one useful draft.',drag:'Repeated scheduling.',asset:'An existing template.'},planEvidence:[],completedAt:new Date('2026-11-09T00:00:00Z')};}
async function seed(u,r) {await require('../models/UserProfile').findOneAndUpdate({userId:u.id},{$set:{purchasedProducts:[{productId:'synthetic',priceId:'price_audit',status:'paid'}],freedomAudit:{latestResult:r,results:[r]}}},{upsert:true,new:true});}
async function preview(u,id){const r=await f.request(u,endpoint+'/source/'+id);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
function consent(p){return {resultId:p.resultId,sourceHash:p.sourceHash,expectedRetained:p.expectedRetained,retain:true};}
async function retained(u){const r=await f.request(u,endpoint);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
before(async()=>{
 process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID='price_audit';process.env.FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES='65536';
 f=await require('./patternFixture.cjs')({reasoning:true,mongoArgs:['--nounixsocket']});process.env.CORE_CONTEXT_WRITE_USER_IDS=f.founder.id+','+f.other.id;
 const life=await f.scope(f.founder,()=>core.saveContext({goals:[{description:'Finish an existing draft.'}]}));goal=String(life.goals[0]._id);
 await seed(f.founder,result('owner-audit'));await seed(f.other,result('other-audit','FOREIGN_AUDIT_CANARY'));
});
after(async()=>{if(f)await f.close();});
test('retention requires ownership, consent, exact source and existing write authorization; retries do not duplicate',async()=>{
 assert.equal((await f.request(null,endpoint)).status,401);
 assert.equal((await f.request(f.other,endpoint+'/source/owner-audit')).status,404);
 const p=await preview(f.founder,'owner-audit');assert.equal(p.expectedRetained,null);
 assert.equal((await f.request(f.founder,endpoint,'POST',{...consent(p),retain:false})).status,400);
 assert.equal((await f.request(f.founder,endpoint,'POST',{...consent(p),userId:f.other.id})).status,400);
 assert.equal((await f.request(f.founder,endpoint,'POST',{...consent(p),sourceHash:'wrong'})).status,409);
 process.env.CORE_CONTEXT_WRITES_ENABLED='false';assert.equal((await f.request(f.founder,endpoint,'POST',consent(p))).status,503);process.env.CORE_CONTEXT_WRITES_ENABLED='true';
 const rs=await Promise.all([f.request(f.founder,endpoint,'POST',consent(p)),f.request(f.founder,endpoint,'POST',consent(p))]);
 rs.forEach(r=>assert.equal(r.status,200,JSON.stringify(r)));
 assert.equal(await require('../models/StrategicMemory').collection.countDocuments({userId:new f.mongoose.Types.ObjectId(f.founder.id),source:audit.SOURCE}),1);
 const saved=await retained(f.founder);assert.deepEqual(saved.audit,p.audit);assert.equal(saved.retained.section,'all');
 assert.equal((await retained(f.other)).retained,null);
 assert.equal((await f.request(f.other,'/api/core/memory/'+saved.retained.memoryId,'DELETE')).status,404);
 assert.equal((await f.request(f.founder,'/api/core/memory/'+saved.retained.memoryId,'PATCH',{content:'Turn it into a fact.'})).status,409);
 await assert.rejects(()=>f.scope(f.founder,()=>core.saveMemory({category:audit.CATEGORY,content:'forged'})),/explicit audit retention/);
 const doc=await f.scope(f.founder,()=>require('../models/StrategicMemory').findById(saved.retained.memoryId).lean());assert.equal(doc.confirmed,false);assert.equal(doc.provenance.kind,'derived');
 assert(!(await f.scope(f.founder,()=>core.listMemory())).some(m=>m.category===audit.CATEGORY));
});
test('full audit survives long history, many newer memories and source-history eviction; both model paths retrieve it',async()=>{
 await f.scope(f.founder,async()=>{
   const state=await core.getConversation();
   await core.appendConversation(Array.from({length:80},(_,i)=>({role:i%2?'model':'user',text:'Unrelated turn '+i})),{contextRevision:state.context.revision,conversationRevision:state.memory.revision});
   await core.withContextMutation(()=>require('../models/StrategicMemory').create(Array.from({length:60},(_,i)=>({title:'Later '+i,content:'Unrelated newer memory '+i}))));
 });
 await require('../models/UserProfile').updateOne({userId:f.founder.id},{$set:{'freedomAudit.results':[],'freedomAudit.latestResult':null}});
 const saved=await retained(f.founder);assert(saved.audit.liberationPlan[5].includes('OWNER_AUDIT'));
 const retry=await f.request(f.founder,endpoint,'POST',{resultId:saved.retained.resultId,sourceHash:saved.retained.sourceHash,expectedRetained:null,retain:true});assert.equal(retry.status,200);assert.equal(retry.data.changed,false);
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='false';
 const legacy=await f.request(f.founder,'/api/core/analyze','POST',{text:'What should I do next?'});assert.equal(legacy.status,200,JSON.stringify(legacy));
 assert(legacyPrompts.at(-1).includes(saved.audit.liberationPlan[5]));assert(!legacyPrompts.at(-1).includes('FOREIGN_AUDIT_CANARY'));assert.equal(legacy.data.auditContinuation.fullAuditIncluded,true);
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='true';
 const m3=await f.request(f.founder,'/api/core/reasoning/preview','POST',{purpose:'mentor',text:'Continue my saved work.',selectedGoalIds:[goal]});assert.equal(m3.status,200,JSON.stringify(m3));
 const prompt=m3Prompts.at(-1);assert(prompt.includes(saved.audit.liberationPlan[5]));
 const c=JSON.parse(prompt.split('Authoritative scoped data:\n')[1].split('\nCurrent user request (data):')[0]);
 assert.equal(c.retainedAudit.coverage.fullAuditIncluded,true);assert.equal(c.manifest[c.retainedAudit.ref].kind,'derivative');assert(!c.facts.some(x=>x.ref===c.retainedAudit.ref));
});
test('budget boundaries stop before provider calls without altering the full snapshot; explicit section retrieval is disclosed',async()=>{
 const {validatePlan,PHASES}=require('../services/freedomAuditPlan');
 const a={ratings:Object.fromEntries(['time','money','obligations','assets','desires'].map(k=>[k,[2,3,4,5]])),weakestDomain:'time',win:'界'.repeat(1000),drag:'山'.repeat(1000),asset:'水'.repeat(1000)};
 const raw=require('./freedomAuditPlanFixture.cjs')(a);raw.priority='Priority '.padEnd(500,'p');raw.moves=raw.moves.map((_,i)=>('Move '+i).padEnd(500,'m'));for(const k of Object.keys(raw.compression))raw.compression[k]=k.padEnd(500,'c');
 raw.plan.forEach((p,i)=>{p.action=('Action '+i).padEnd(500,'a');p.checkpoint='Count '.padEnd(240,'b');p.evidence=[{id:'win',quote:a.win},{id:'drag',quote:a.drag},{id:'asset',quote:a.asset},{id:'time.1',quote:require('../services/freedomAuditPlan').evidenceFor(a)['time.1']}];});
 const v=validatePlan(raw,a),large={...result('large-audit'),inputs:a,highestLeveragePriority:v.priority,leverageMoves:v.moves,compression:v.compression,liberationPlan:v.plan,planEvidence:v.planEvidence,analysisMethod:v.analysisMethod};
 await seed(f.founder,large);const p=await preview(f.founder,'large-audit');assert.equal((await f.request(f.founder,endpoint,'POST',consent(p))).status,200);
 const before=await retained(f.founder);assert.deepEqual(before.audit,p.audit);const calls=m3Prompts.length;
 const blocked=await f.request(f.founder,'/api/core/reasoning/preview','POST',{purpose:'mentor',text:'Continue.',selectedGoalIds:[goal]});assert.equal(blocked.status,413,JSON.stringify(blocked));assert.equal(m3Prompts.length,calls);
 assert.deepEqual((await retained(f.founder)).audit,p.audit);
 assert.equal((await f.request(f.founder,endpoint,'PATCH',{expectedRetained:before.expectedRetained,section:'phase-6'})).status,200);
 const selected=await f.scope(f.founder,()=>audit.resolve());assert.equal(selected.context.data.phase,p.audit.liberationPlan[5]);assert.equal(selected.context.coverage.fullAuditIncluded,false);assert(selected.context.coverage.omitted.includes('planEvidence'));
 assert.deepEqual((await retained(f.founder)).audit,p.audit);
 audit.assertPromptBudget('x'.repeat(65536));assert.throws(()=>audit.assertPromptBudget('x'.repeat(65537)),/budget/);
 assert.throws(()=>audit.assertPromptBudget('界'.repeat(21846)),/budget/);
 const setting=process.env.FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES;delete process.env.FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES;assert.throws(()=>audit.assertPromptBudget('small'),/not been configured/);process.env.FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES=setting;
});
test('deletion during legacy generation prevents stale replies and resurrection, without touching purchases or source audits',async()=>{
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='false';
 const before=await retained(f.founder);const commerce=JSON.stringify(await require('../models/UserProfile').findOne({userId:f.founder.id}).lean());
 let started,release;const entered=new Promise(r=>started=r),wait=new Promise(r=>release=r);delay=async()=>{started();await wait;};
 const pending=f.request(f.founder,'/api/core/analyze','POST',{text:'Continue the selected phase.'});await entered;
 const removal=await f.request(f.founder,endpoint,'DELETE',{expectedRetained:before.expectedRetained});assert.equal(removal.status,200,JSON.stringify(removal));release();const answer=await pending;delay=null;
 assert.equal(answer.status,409,JSON.stringify(answer));assert.equal((await retained(f.founder)).retained,null);
 assert.equal(JSON.stringify(await require('../models/UserProfile').findOne({userId:f.founder.id}).lean()),commerce);
 assert.deepEqual((await f.scope(f.founder,()=>core.getConversation())).memory.conversationHistory,[]);
 process.env.CORE_REASONING_RECONCILIATION_ENABLED='true';
});
test('M3 rejects a retained audit deleted while its provider response is pending',async()=>{
 const p=await preview(f.founder,'large-audit');await f.request(f.founder,endpoint,'POST',consent(p));
 let saved=await retained(f.founder);await f.request(f.founder,endpoint,'PATCH',{expectedRetained:saved.expectedRetained,section:'phase-6'});saved=await retained(f.founder);
 let started,release;const entered=new Promise(r=>started=r),wait=new Promise(r=>release=r);delay=async()=>{started();await wait;};
 const pending=f.request(f.founder,'/api/core/reasoning/preview','POST',{purpose:'mentor',text:'Continue.',selectedGoalIds:[goal]});await entered;
 assert.equal((await f.request(f.founder,endpoint,'DELETE',{expectedRetained:saved.expectedRetained})).status,200);release();const answer=await pending;delay=null;
 assert.equal(answer.status,409,JSON.stringify(answer));assert.equal((await retained(f.founder)).retained,null);
});
test('personal Core erasure removes only the owner retained audit; revoked access blocks context but still permits removal',async()=>{
 const own=await preview(f.founder,'large-audit');assert.equal((await f.request(f.founder,endpoint,'POST',consent(own))).status,200);
 const other=await preview(f.other,'other-audit');assert.equal((await f.request(f.other,endpoint,'POST',consent(other))).status,200);
 await require('../models/UserProfile').updateOne({userId:f.other.id},{$set:{'purchasedProducts.0.status':'refunded'}});
 const blocked=await retained(f.other);assert.equal(blocked.accessAllowed,false);assert.equal(blocked.audit,null);
 await assert.rejects(()=>f.scope(f.other,()=>audit.resolve()),e=>e.statusCode===403);
 await f.scope(f.founder,()=>core.eraseContext());assert.equal((await retained(f.founder)).retained,null);assert((await retained(f.other)).retained);
 assert.equal((await f.request(f.other,endpoint,'DELETE',{expectedRetained:blocked.expectedRetained})).status,200);
});
