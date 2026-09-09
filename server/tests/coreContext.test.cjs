const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-context-test-secret';delete process.env.MONGO_URI;
process.env.CORE_CONTEXT_WRITES_ENABLED='true';
process.env.MONGOMS_DOWNLOAD_DIR=path.resolve(__dirname,'../../.cache/mongodb-binaries');
const {MongoMemoryReplSet}=require('mongodb-memory-server');const mongoose=require('mongoose');const express=require('express');const jwt=require('jsonwebtoken');
const {runWithRequestContext}=require('../utils/requestContext');const User=require('../models/User');const AuthSession=require('../models/AuthSession');
const LifeContext=require('../models/LifeContext');const Memory=require('../models/Memory');const core=require('../services/coreContextService');
let modelGate=null, modelStarted=()=>{}, lastPrompt='';
require('../services/modelRouter').requestModelJson=async({prompt})=>{lastPrompt=prompt;modelStarted();if(modelGate)await modelGate;return {data:{candidates:[{content:{parts:[{text:JSON.stringify({objectives:['stale model response'],constraints:[],risks:[],leverage:[],next_actions:[]})}]}}]}};};
let db,server,base,a,b;
const scope=(u,fn)=>runWithRequestContext({userId:u.id,sessionId:u.sid,authenticated:true},fn);
async function user(name){const doc=await User.create({name,username:name,email:name+'@example.test',password:'fixture-hash',role:'USER'});const sid='session-'+name;await AuthSession.create({userId:doc._id,sessionId:sid,expiresAt:new Date(Date.now()+600000)});return {id:String(doc._id),sid,token:jwt.sign({id:String(doc._id),sid},process.env.JWT_SECRET)};}
async function request(u,route,method='GET',body){const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+u.token},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};}
before(async()=>{
 db=await MongoMemoryReplSet.create({replSet:{count:1,dbName:'context_fixtures'}});await mongoose.connect(db.getUri());await LifeContext.createIndexes();await Memory.createIndexes();a=await user('context-a');b=await user('context-b');
 process.env.CORE_CONTEXT_WRITE_USER_IDS=[a.id,b.id].join(',');
 const app=express();app.use(express.json());app.use('/api/core/analyze',require('../routes/memoryAnalyzeRoutes'));app.use('/api/core',require('../routes/coreContextRoutes'));app.use('/api/core',require('../routes/API/coreRoutes'));app.use('/api/memory',require('../routes/memoryRoutes'));app.use('/api/onboarding',require('../routes/onboardingRoutes'));app.use('/api/mentor-system',require('../routes/mentorSystemRoutes'));
 app.use((err,_req,res,_next)=>res.status(err.statusCode || err.status || (res.statusCode>=400?res.statusCode:500)).json({message:err.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(db)await db.stop();});

test('non-wellness business goal survives a second authenticated session without wellness data',async()=>{
 const saved=await request(a,'/api/core/context','PUT',{goals:[{description:'Launch a print studio',domain:'business',successMeasure:'Publish three paid prints'}],constraints:[{description:'Four hours per week',kind:'time',hard:true}],resources:[{description:'Existing portfolio'}]});
 assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.goals[0].domain,'business');
 const sid='second-context-session';await AuthSession.create({userId:a.id,sessionId:sid,expiresAt:new Date(Date.now()+600000)});const next={...a,sid,token:jwt.sign({id:a.id,sid},process.env.JWT_SECRET)};
 const loaded=await request(next,'/api/core/context');assert.equal(loaded.data.goals[0]._id,saved.data.goals[0]._id);assert.equal(loaded.data.goals[0].successMeasure,'Publish three paid prints');
 assert.equal(await require('../models/SignalEntry').collection.countDocuments({userId:new mongoose.Types.ObjectId(a.id)}),0);
 assert.equal((await User.findById(a.id)).role,'USER');assert.equal((await User.findById(a.id)).password,'fixture-hash');
 assert.equal((await request(b,'/api/core/context')).data.goals.length,0);
 const spoof=await request(b,'/api/core/context','PUT',{goals:[saved.data.goals[0]]});assert.equal(spoof.status,404);
});
test('legacy mentor intake/tasks/signals/messages use canonical stores and do not create parallel rows',async()=>{
 let r=await request(a,'/api/mentor-system/intake','POST',{profile:{preferred_name:'Artist'},life_context:{current_challenges:['Scheduling']}});assert.equal(r.status,200,JSON.stringify(r));
 r=await request(a,'/api/mentor-system/tasks','POST',{title:'Prepare print files'});assert.equal(r.status,201,JSON.stringify(r));const id=r.data._id;
 assert((await request(a,'/api/core/tasks')).data.tasks.some(t=>t._id===id));
 assert.equal((await request(a,'/api/core/tasks/'+id+'/complete','POST',{})).status,200);
 assert.equal((await request(a,'/api/mentor-system/tasks')).data.find(t=>t._id===id).status,'complete');
 assert.equal((await request(a,'/api/mentor-system/signals','POST',{signal_type:'focus',value:7})).status,201);
 assert.equal((await request(a,'/api/mentor-system/messages','POST',{message_type:'reflection',content:'Protect a studio morning'})).status,201);
 for(const name of ['MentorProfile','MentorSignal','MentorTask','MentorMessage']) assert.equal(await require('../models/'+name).collection.countDocuments({}),0,name);
 assert((await request(a,'/api/core/memory')).data.entries.some(m=>m.content==='Protect a studio morning'));
 assert.equal((await request(a,'/api/mentor-system/intake','POST',{profile:{user_id:b.id}})).status,400);
 assert.equal((await request(a,'/api/mentor-system/loop-status','POST',{active:true})).status,409);
});
test('onboarding aliases write LifeContext without recreating independent profile goals',async()=>{
 const r=await request(b,'/api/core/onboarding/complete','POST',{preferredName:'Builder',goals:['Complete a portfolio'],mentorStyle:'clear'});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal((await request(b,'/api/onboarding/profile-context','POST',{sovereignMatrixNote:'User-provided direction'})).status,200);
 const status=await request(b,'/api/core/onboarding/status');assert.equal(status.data.completed,true);assert.deepEqual(status.data.profile.goals,['Complete a portfolio']);
 assert(!(await User.findById(b.id)).onboarding.profile.goals.length);
});
test('observation retries deduplicate under the transactional context authority',async()=>{
 const payload={domain:'creative',observationType:'work-session',value:2,sourceId:'session-01',notes:'Two focused hours'};
 const results=await Promise.all([request(a,'/api/core/signals','POST',payload),request(a,'/api/core/signals','POST',payload)]);
 assert(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results[0].data._id,results[1].data._id);
});
test('memory correction clears derived caches without changing another user',async()=>{
 const aFact=await scope(a,()=>core.saveMemory({content:'Old direction'}));const bFact=await scope(b,()=>core.saveMemory({content:'Other user private fact'}));
 await scope(a,()=>Memory.findOneAndUpdate({},{$set:{conversationHistory:[{role:'model',text:'Old direction'}]}},{upsert:true}));
 await scope(a,()=>require('../models/KernelCycle').create({output:{reasoning_summary:'Old direction'}}));
 const r=await request(a,'/api/core/memory/'+aFact._id,'PATCH',{content:'New direction'});assert.equal(r.status,200,JSON.stringify(r));
 assert(!JSON.stringify(r.data).includes('Old direction'));
 assert.equal((await request(a,'/api/memory')).data.conversationHistory.length,0);assert((await request(a,'/api/core/kernel/inspect')).data.cycles.every(c=>c.output===null));
 assert.equal((await scope(b,()=>require('../models/StrategicMemory').findById(bFact._id))).content,'Other user private fact');
 assert.equal((await request(a,'/api/core/memory/'+bFact._id,'DELETE')).status,404);
});
test('a model response in flight during deletion is rejected instead of resurrecting conversation',async()=>{
 let release;modelGate=new Promise(r=>{release=r;});const entered=new Promise(r=>{modelStarted=r;});
 const pending=request(a,'/api/core/analyze','POST',{text:'Help with the old context'});
 await entered;
 assert.equal((await request(a,'/api/memory/conversation','DELETE')).status,200);release();modelGate=null;
 assert.equal((await pending).status,409);assert.equal((await request(a,'/api/memory')).data.conversationHistory.length,0);
});
test('privacy deletion prevents resurrection from onboarding, old mentor stores and cached snapshots',async()=>{
 await User.updateOne({_id:a.id},{$set:{'onboarding.profile.sovereignMatrixNote':'legacy-secret','onboarding.profile.goals':['legacy-secret']}});
 await require('../models/MentorMessage').collection.insertOne({user_id:new mongoose.Types.ObjectId(a.id),message_type:'reflection',content:'legacy-secret'});
 await scope(a,()=>Memory.findOneAndUpdate({},{$set:{sovereignContext:{sovereignMatrixNote:'legacy-secret'},conversationHistory:[{role:'user',text:'legacy-secret'}]}},{upsert:true}));
 const r=await request(a,'/api/core/context','DELETE');assert.equal(r.status,200,JSON.stringify(r));
 for(const route of ['/api/core/context','/api/core/onboarding/status','/api/memory','/api/core/memory','/api/mentor-system/intake','/api/mentor-system/messages','/api/core/summary']) {
   const result=await request(a,route);assert.equal(result.status,200,route);assert(!JSON.stringify(result.data).includes('legacy-secret'),route);
 }
 assert((await scope(a,()=>LifeContext.findOne())).legacySuppressedAt);
 assert((await scope(b,()=>core.getContext())).goals.length>0);
 const analyzed=await request(a,'/api/core/analyze','POST',{text:'A new request',context:{goals:['legacy-secret'],recentCommands:['legacy-secret'],sovereignMatrixNote:'legacy-secret',traumaAwareStack:{summary:'legacy-secret'}}});
 assert.equal(analyzed.status,200,JSON.stringify(analyzed));assert(!lastPrompt.includes('legacy-secret'));
});
test('missing ownership index fails closed without context writes',async()=>{
 await LifeContext.collection.dropIndex('user_id_1');
 try {
   assert.equal((await request(a,'/api/core/context','PUT',{goals:['Must not save']})).status,503);
   assert(!(await scope(a,()=>core.getContext())).goals.some(g=>g.description==='Must not save'));
 } finally {await LifeContext.createIndexes();}
});
