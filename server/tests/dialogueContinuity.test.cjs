const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const core=require('../services/coreContextService'),router=require('../services/modelRouter');
const presentation=require('../services/conversationPresentation');
let f,delay,invalid=false;const prompts=[];
const late='The last image suggests a pause, not a broken relationship.';
router.requestModelJson=async({prompt})=>{
 prompts.push(prompt);if(delay)await delay();
 const output={objectives:['Explore the supplied metaphor.'],constraints:['Its origin is unknown.'],risks:[],leverage:['Tentative reading. '.repeat(65)+late],next_actions:['Does that reading fit your correction?']};
 return {data:{candidates:[{content:{parts:[{text:invalid?'not json':JSON.stringify(output)}]}}]},model:'synthetic'};
};
router.generateStructured=async({prompt})=>{
 prompts.push(prompt);if(delay)await delay();
 const c=JSON.parse(prompt.split('Authoritative scoped data:\n')[1].split('\nCurrent user request (data):')[0]);
 return {text:JSON.stringify({interpretation:{text:'Tentative reading. '.repeat(65)+late,evidenceRefs:c.conversation.slice(-2).map(t=>t.ref),uncertainty:['The origin and external meaning are unknown; this is interpretation of supplied dialogue.']},recommendations:[],plan:null,questions:['Does this fit?'],constraintConflicts:[]}),provider:'gemini',model:'synthetic'};
};
before(async()=>{f=await require('./patternFixture.cjs')({reasoning:true,mongoArgs:['--nounixsocket']});});
after(async()=>{if(f)await f.close();});
async function chat(text){const r=await f.request(f.founder,'/api/core/analyze','POST',{text});assert.equal(r.status,200,JSON.stringify(r));return r.data;}
test('both HTTP paths preserve late assistant text and user corrections on reload and subsequent requests',async()=>{
 for(const enabled of ['false','true']){
  await f.scope(f.founder,()=>core.clearConversation());process.env.CORE_REASONING_RECONCILIATION_ENABLED=enabled;
  const first=await chat('Interpret the supplied image of a bridge.');
  assert(first.reasoning_summary.includes(late));assert(first.reasoning_summary.indexOf(late)>700);
  const reload=await f.request(f.founder,'/api/memory');assert.equal(reload.status,200);
  assert.equal(reload.data.conversationHistory.at(-1).text,first.reasoning_summary);
  await chat('Correction: the pause belongs to the narrator, not the relationship.');
  assert(prompts.at(-1).includes(late));await chat('What did I correct?');
  assert(prompts.at(-1).includes('Correction: the pause belongs to the narrator'));
  const memory=await f.scope(f.founder,()=>core.getConversation());
  assert.deepEqual(memory.memory.conversationHistory.map(t=>t.role),['user','model','user','model','user','model']);
  const foreign=await f.request(f.other,'/api/memory');assert(!JSON.stringify(foreign.data).includes(late));
 }
});
test('M3 dialogue without a goal is derivative, never a fact or Pattern observation; planning still asks for a goal',async()=>{
 const c=await f.scope(f.founder,()=>require('../services/reasoningContextService').assemble({purpose:'analyze',text:'Reflect',selectedGoalIds:[]}));
 assert(c.conversation.some(t=>t.role==='model'&&c.manifest[t.ref].kind==='derivative'));
 assert(!JSON.stringify(c.facts).includes(late));assert.equal(c.observations.length,0);assert.equal(c.patternContext.patterns.length,0);
 assert(prompts.at(-1).includes('external-transmission proof'));assert(prompts.at(-1).includes('Missing resources, capacity, outcomes and wellness are unknown'));
 const n=prompts.length,r=await f.request(f.founder,'/api/core/reasoning/preview','POST',{purpose:'planner',text:'Prioritize my work.'});
 assert.equal(r.data.status,'needs_clarification');assert.equal(prompts.length,n);
});
test('context budget retains newest whole exchange, including late corrections; limits reject without partial writes',async()=>{
 await f.scope(f.founder,async()=>{const s=await core.getConversation();await core.appendConversation(Array.from({length:40},(_,i)=>({role:i%2?'model':'user',text:('whole turn '+i+' ').padEnd(5900,'x')+(i===39?'LATEST_CORRECTION':'')})),{contextRevision:s.context.revision,conversationRevision:s.memory.revision});});
 const c=await f.scope(f.founder,()=>require('../services/reasoningContextService').assemble({purpose:'analyze',selectedGoalIds:[],text:'Continue'}));
 assert(c.conversation.at(-1).text.endsWith('LATEST_CORRECTION'));assert(c.coverage.ConversationTurn.budgetOmitted>0);assert(Buffer.byteLength(JSON.stringify(c))<66000);
 const h=presentation.history((await f.scope(f.founder,()=>core.getConversation())).memory.conversationHistory);assert(h.includes('LATEST_CORRECTION'));
 assert.equal(presentation.bounded('x'.repeat(6000)).length,6000);assert.throws(()=>presentation.bounded('x'.repeat(6001)));
 const before=JSON.stringify(await f.scope(f.founder,()=>core.getConversation()));
 for(const enabled of ['true','false']){process.env.CORE_REASONING_RECONCILIATION_ENABLED=enabled;assert.equal((await f.request(f.founder,'/api/core/analyze','POST',{text:'x'.repeat(6001)})).status,400);}
 invalid=true;assert.equal((await f.request(f.founder,'/api/core/analyze','POST',{text:'Continue'})).status,502);invalid=false;
 assert.equal(JSON.stringify(await f.scope(f.founder,()=>core.getConversation())),before);
});
test('deletion during generation prevents stale dialogue resurrection on both paths',async()=>{
 for(const enabled of ['false','true']){
  process.env.CORE_REASONING_RECONCILIATION_ENABLED=enabled;
  let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);delay=async()=>{enter();await wait;};
  const pending=f.request(f.founder,'/api/core/analyze','POST',{text:'Interpret this.'});await entered;
  await f.scope(f.founder,()=>core.clearConversation());release();const r=await pending;delay=null;
  assert.equal(r.status,409,JSON.stringify(r));assert.deepEqual((await f.scope(f.founder,()=>core.getConversation())).memory.conversationHistory,[]);
 }
});

test('interpretation validation rejects fabricated references and missing uncertainty',()=>{
 const contracts=require('../contracts/reasoningContracts'),context={manifest:{},selectedGoalIds:[]};
 const base={recommendations:[],plan:null,questions:[],constraintConflicts:[]};
 assert.throws(()=>contracts.output({...base,interpretation:{text:'A tentative reading.',evidenceRefs:['ConversationTurn:foreign'],uncertainty:['Unknown origin.']}},context),/Unknown evidence reference/);
 assert.throws(()=>contracts.output({...base,interpretation:{text:'A tentative reading.',evidenceRefs:[],uncertainty:[]}},context),/uncertainty/);
 assert.throws(()=>contracts.output({...base,interpretation:{text:'x'.repeat(2501),evidenceRefs:[],uncertainty:['Unknown origin.']}},context),/Invalid response text/);
});
