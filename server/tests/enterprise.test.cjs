const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {canRead,parseEvent}=require('../enterprise/policy');
const {collect}=require('../enterprise/sources');
const {analyze}=require('../enterprise/analysis');
const {runMonitor,INTERVAL}=require('../enterprise/monitor');
const {normalize}=require('../enterprise/socialRead');
let f,db;
before(async()=>{f=await require('./patternFixture.cjs')();db=f.mongoose.connection.db;process.env.ENTERPRISE_INTELLIGENCE_ENABLED='true';process.env.ENTERPRISE_OWNER_USER_ID=f.founder.id;process.env.CORE_REASONING_RECONCILIATION_ENABLED='false';f.app.use('/api/enterprise',require('../routes/enterpriseRoutes'));setRequest();});
function setRequest(){f.request=async(u,route,method='GET',body,headers={})=>{const r=await fetch(f.base+route,{method,headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+u.token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}return {status:r.status,data};};}
after(async()=>{await f?.close();});
const origin={Origin:'https://freedom.toisouljahacademy.com'};
const event=()=>({id:crypto.randomUUID(),visitId:crypto.randomUUID(),event:'landing_view',source:'youtube',campaign:'freedom_audit_launch'});
const sample=()=>({window:{start:'2026-09-09T05:00:00Z',end:new Date().toISOString()},social:{posts:[{id:'p',platform:'tiktok',status:'approved',errorCode:'TIKTOK_NOT_AVAILABLE',inWindow:false}],coverage:'receipts'},commerce:{ok:true,customerSessions:0,founderSessions:3,sales:0,revenue:0,attempts:0},product:{entitlements:0,completions:0},telemetry:{counts:[],since:null},auth:[],health:{api:{status:200}},personalExecution:'DISABLED',m3:'OFF'});
test('exact owner plus role and gate required; role spoof and broad scope denied',async()=>{
 assert.equal(canRead({_id:f.founder.id,role:'COMMANDER_IN_CHIEF'}),true);
 for(const user of [{_id:f.other.id,role:'COMMANDER_IN_CHIEF'},{_id:f.founder.id,role:'USER'},null])assert.equal(canRead(user),false);
 assert.equal((await f.request(f.other,'/api/enterprise/brief')).status,404);
 assert.equal((await f.request(null,'/api/enterprise/brief')).status,401);
 assert.equal((await f.request(f.founder,'/api/enterprise/brief?owner='+f.other.id)).status,200);
 process.env.ENTERPRISE_INTELLIGENCE_ENABLED='false';assert.equal((await f.request(f.founder,'/api/enterprise/brief')).status,404);process.env.ENTERPRISE_INTELLIGENCE_ENABLED='true';
});
test('event allowlist rejects personal payload; repeated event is exactly once and wrong origin writes nothing',async()=>{
 const e=event();assert.equal(parseEvent({...e,LifeContext:'private'}),null);assert.equal(parseEvent({...e,event:'purchase'}),null);
 assert.equal((await f.request(null,'/api/enterprise/events','POST',e,origin)).status,204);
 assert.equal((await f.request(null,'/api/enterprise/events','POST',e,origin)).status,204);
 assert.equal(await db.collection('enterpriseevents').countDocuments({_id:e.id}),1);
 const other=event();await f.request(null,'/api/enterprise/events','POST',other,{Origin:'https://evil.test'});assert.equal(await db.collection('enterpriseevents').countDocuments({_id:other.id}),0);
 const stored=await db.collection('enterpriseevents').findOne({_id:e.id});assert.equal(stored.authority,'unverified_browser_event');assert.equal(stored.source,'youtube');assert.equal(stored.userId,undefined);assert.equal(stored.ip,undefined);
});
test('analysis distinguishes missing metrics, owner checks and comparable cohorts',()=>{
 assert.deepEqual(normalize({},'youtube'),{});assert.deepEqual(normalize({items:[{statistics:{viewCount:'1',likeCount:'0'}}]},'youtube'),{views:1,likes:0});
 assert.deepEqual(normalize({data:[{name:'reach',values:[{value:0}]}]},'meta'),{reach:0});
 const b=analyze(sample());assert.equal(b.revenue.sales,0);assert.equal(b.funnel.find(r=>r.stage==='Landing visits').count,null);assert.equal(b.funnel.find(r=>r.stage==='Checkout-session creation').founderValidationCount,3);assert.ok(b.funnel.every(r=>r.conversion===null));assert.equal(b.roles.length,10);assert.equal(b.execution,'DISABLED');assert.ok(b.approvalQueue.length<=5);
 const failed=sample();failed.commerce.ok=false;failed.health.api.status=503;assert.equal(analyze(failed).revenue.sales,null);assert.ok(analyze(failed).findings.some(x=>x.severity==='INCIDENT'));
});
test('restart lease, alert deduplication and failed-intervention suppression persist',async()=>{
 const now=new Date();let reads=0;const collectImpl=async()=>{reads++;return sample();};
 const first=await runMonitor({db,collectImpl,now});assert.equal(first.status,'OK');
 assert.equal((await runMonitor({db,collectImpl,now})).status,'BUSY');assert.equal(reads,1);
 const count=await db.collection('enterprisedecisions').countDocuments({owner:f.founder.id});
 await db.collection('enterprisedecisions').updateOne({owner:f.founder.id,findingId:'distribution-blocked'},{$set:{decision:'failed'}});
 assert.equal((await runMonitor({db,collectImpl,now:new Date(+now+INTERVAL+1)})).status,'OK');assert.equal(await db.collection('enterprisedecisions').countDocuments({owner:f.founder.id}),count);
 const stored=await db.collection('enterprisestates').findOne({owner:f.founder.id});assert.equal(stored.brief.findings.find(x=>x.id==='distribution-blocked').suppressed,true);
});
test('repeated GET is zero-write, foreign ledger is inaccessible, decision does not execute',async()=>{
 await db.collection('enterprisedecisions').insertOne({_id:'foreign',owner:f.other.id,problem:'PRIVATE_CANARY'});
 const writes=[],watch=e=>{if(['insert','update','delete','findAndModify','createIndexes'].includes(e.commandName))writes.push(e.commandName);};f.mongoose.connection.getClient().on('commandStarted',watch);
 try{for(let i=0;i<3;i++){const r=await f.request(f.founder,'/api/enterprise/brief');assert.equal(r.status,200);assert.ok(!JSON.stringify(r.data).includes('PRIVATE_CANARY'));}}finally{f.mongoose.connection.getClient().off('commandStarted',watch);}assert.deepEqual(writes,[]);
 assert.equal((await f.request(f.founder,'/api/enterprise/decisions/foreign','PATCH',{decision:'keep',interpretation:'test',actualResult:'test'})).status,404);
 assert.equal(await db.collection('tasks').countDocuments({}),0);assert.equal(process.env.CORE_PERSONAL_EXECUTION_ENABLED,'false');assert.equal(process.env.CORE_REASONING_RECONCILIATION_ENABLED,'false');
});
test('business source adapter scopes Social and projects completion timestamps; Stripe is read-only and excludes founder',async()=>{
 const owner=new f.mongoose.Types.ObjectId(f.founder.id),other=new f.mongoose.Types.ObjectId(f.other.id),at=new Date();
 await db.collection('socialcampaigns').insertMany([{userId:owner,name:'Owned',posts:[{_id:new f.mongoose.Types.ObjectId(),provider:'youtube',publishStatus:'published',publishedAt:at,link:'https://example.test/?utm_source=youtube'}]},{userId:other,name:'FOREIGN_CANARY',posts:[]}]);
 await db.collection('userprofiles').insertOne({userId:other,purchasedProducts:[{priceId:'price_test',status:'paid',purchasedAt:at}],freedomAudit:{results:[{completedAt:at,inputs:{win:'PRIVATE_ANSWER'}}]}});
 const calls=[];const stripe={checkout:{sessions:{list:args=>{calls.push(args);return (async function*(){yield {metadata:{productSlug:'freedom-audit'},client_reference_id:f.founder.id,payment_status:'unpaid'};yield {metadata:{priceId:'price_test'},client_reference_id:f.other.id,payment_status:'paid',currency:'usd',amount_total:3700,payment_intent:{latest_charge:{id:'charge'}}};yield {metadata:{productSlug:'other'},payment_status:'paid',amount_total:99999};})();}}},webhookEndpoints:{list:async()=>({data:[]})}};
 const commands=[],watch=e=>commands.push({name:e.commandName,command:e.command});f.mongoose.connection.getClient().on('commandStarted',watch);
 let result;try{result=await collect({db,owner:f.founder.id,env:{FREEDOM_AUDIT_STRIPE_PRICE_ID:'price_test'},stripe,fetchImpl:async()=>({status:200,body:{cancel:async()=>{}}}),now:new Date(+at+1000)});}finally{f.mongoose.connection.getClient().off('commandStarted',watch);}
 assert.equal(result.commerce.sales,1);assert.equal(result.commerce.revenue,3700);assert.equal(result.commerce.founderSessions,1);assert.equal(result.product.completions,1);assert.ok(!JSON.stringify(result).includes('PRIVATE_ANSWER'));assert.ok(!JSON.stringify(result).includes('FOREIGN_CANARY'));
 assert.ok(!commands.some(c=>['insert','update','delete','findAndModify','createIndexes'].includes(c.name)));assert.equal(result.social.posts.length,1);assert.equal(calls.length,1);
 const forbidden=['lifecontexts','memories','patterns','strategicmemories','signalentries','reasoningrecords','tasks'];assert.ok(!commands.some(c=>forbidden.includes(c.command.find||c.command.aggregate)));
});
test('response observer never reads body and records only bounded operational fields',async()=>{
 const {EventEmitter}=require('node:events'),{observeBusiness}=require('../enterprise/observe');
 const req={path:'/api/freedom-audit/checkout/session',method:'POST',user:{_id:f.founder.id},get:()=>null};Object.defineProperty(req,'body',{get(){throw Error('Private body accessed');}});
 const res=new EventEmitter();res.statusCode=503;let next=0;observeBusiness(req,res,()=>next++);assert.equal(next,1);res.emit('finish');
 for(let i=0;i<20&&!await db.collection('enterpriseevents').findOne({event:'server_checkout_failure'});i++)await new Promise(r=>setTimeout(r,10));
 const record=await db.collection('enterpriseevents').findOne({event:'server_checkout_failure'});assert.equal(record.status,503);assert.equal(record.cohort,'founder');assert.equal(record.body,undefined);assert.equal(record.userId,undefined);
});
test('browser telemetry excludes private fields, honors privacy signals and cannot block a buyer action',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),source=fs.readFileSync(require('node:path').join(__dirname,'../../freedom-audit/business-telemetry.js'),'utf8'),sent=[],store=new Map();
 const context={window:{},location:{hostname:'freedom.toisouljahacademy.com',search:'?utm_source=youtube&utm_campaign=freedom_audit_launch&private=SECRET'},navigator:{},URLSearchParams,crypto,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},fetch:(_url,options)=>{sent.push(JSON.parse(options.body));return Promise.resolve();}};
 vm.runInNewContext(source,context);context.window.freedomBusinessEvent('checkout_start');assert.equal(sent.length,2);assert.ok(!JSON.stringify(sent).includes('SECRET'));assert.equal(sent[0].visitId,sent[1].visitId);assert.notEqual(sent[0].id,sent[1].id);
 context.navigator.globalPrivacyControl=true;vm.runInNewContext(source,context);context.window.freedomBusinessEvent('checkout_start');assert.equal(sent.length,2);
 context.navigator.globalPrivacyControl=false;context.sessionStorage.getItem=()=>{throw Error('blocked storage');};vm.runInNewContext(source,context);assert.doesNotThrow(()=>context.window.freedomBusinessEvent('checkout_start'));
});
