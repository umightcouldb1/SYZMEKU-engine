const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.CORE_CONTEXT_WRITES_ENABLED = 'true';
process.env.JWT_SECRET = 'synthetic-m1-test-secret-not-for-deployment';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../../.cache/mongodb-binaries');
delete process.env.MONGO_URI;
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { runWithRequestContext } = require('../utils/requestContext');
const { runAuthenticatedCoreJob } = require('../services/coreScopeService');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const Task = require('../models/Task');
const SignalEntry = require('../models/SignalEntry');
const StrategicMemory = require('../models/StrategicMemory');
const System = require('../models/System');
const SystemExecution = require('../models/SystemExecution');
const KernelCycle = require('../models/KernelCycle');
const AgentLoopState = require('../models/AgentLoopState');
// Never call a real model provider from the fixture app.
require('../services/modelRouter').requestModelJson = async () => ({data: {candidates: [{content: {parts: [{text: '{"objectives":["fixture"],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}' }]}}]}});
const core = require('../routes/API/coreRoutes');
let mongod, server, base, a, b;
const scope = (u, callback) => runWithRequestContext({userId: u.id, sessionId: u.sid, authenticated: true}, callback);
async function request(user, route, method = 'GET', body) {
  const response = await fetch(base + route, {method, headers: {'Content-Type':'application/json', ...(user ? {Authorization: 'Bearer ' + user.token} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  return {status: response.status, data: await response.json()};
}
async function fixtureUser(name, role) {
  const user = await User.create({name,username:name,email:name+'@example.test',password:'synthetic-fixture-hash',role});
  const sid = 'fixture-'+name;
  await AuthSession.create({userId:user._id, sessionId:sid, expiresAt:new Date(Date.now()+600000)});
  return {id:String(user._id),sid,token:jwt.sign({id:String(user._id),sid},process.env.JWT_SECRET,{expiresIn:'10m'})};
}
before(async () => {
  mongod = await MongoMemoryReplSet.create({replSet:{count:1,dbName:'m1_scope_fixtures'}});
  await mongoose.connect(mongod.getUri());
  await require('../models/LifeContext').createIndexes();
  await require('../models/Memory').createIndexes();
  a = await fixtureUser('scope-a','COMMANDER_IN_CHIEF'); b = await fixtureUser('scope-b','USER');
  const app = express(); app.use(express.json()); app.use('/api/core',require('../routes/coreContextRoutes')); app.use('/api/core',core);
  app.use('/api/memory',require('../routes/memoryRoutes'));
  app.use('/api/mentor-system',require('../routes/mentorSystemRoutes'));
  app.use((error,_req,res,_next)=>res.status(error.statusCode || error.status || (res.statusCode >= 400 ? res.statusCode : 500)).json({code:error.code || 'ERROR',message:error.message}));
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{ if(server) await new Promise(resolve=>server.close(resolve)); await mongoose.disconnect(); if(mongod) await mongod.stop(); });

test('anonymous requests and user operator calls are denied',async()=>{
  for(const route of ['/summary','/memory','/signals','/tasks','/kernel/inspect']) assert.equal((await request(null,'/api/core'+route)).status,401);
  assert.equal((await request(b,'/api/core/systems')).status,403);
  assert.equal((await request(a,'/api/core/operator/visibility')).data.canAccessOperatorMode,true);
  assert.equal((await request(b,'/api/core/operator/visibility')).data.canAccessOperatorMode,false);
});
test('HTTP signals/tasks reject owner spoofing and direct IDs cannot cross tenants',async()=>{
  for(const endpoint of ['signals','tasks']) assert.equal((await request(a,'/api/core/'+endpoint,'POST',{userId:b.id,description:'spoof',sleep:7})).status,400);
  const sa=await request(a,'/api/core/signals','POST',{sleep:7,notes:'A-only'});
  const sb=await request(b,'/api/core/signals','POST',{sleep:8,notes:'B-only'});
  assert.equal(sa.status,200);assert.equal(sb.status,200);
  assert.deepEqual((await request(a,'/api/core/signals')).data.entries.map(x=>x.notes),['A-only']);
  const task=await request(b,'/api/core/tasks','POST',{description:'B task'});
  assert.equal((await request(a,'/api/core/tasks/'+task.data._id+'/complete','POST',{})).status,404);
  assert.equal((await scope(b,()=>Task.findById(task.data._id))).status,'open');
});
test('unowned and other-user memory/history stay out of authenticated views',async()=>{
  await StrategicMemory.collection.insertOne({title:'historic',content:'unowned-secret'});
  await scope(a,()=>StrategicMemory.create({title:'A',content:'A-secret'}));
  await scope(b,()=>StrategicMemory.create({title:'B',content:'B-secret'}));
  await scope(b,()=>KernelCycle.create({output:{reasoning_summary:'B-kernel-secret'}}));
  await KernelCycle.collection.insertOne({output:{reasoning_summary:'unowned-kernel-secret'}});
  const memory=await request(a,'/api/core/memory');
  assert.equal(memory.status,200);assert.deepEqual(memory.data.entries.map(x=>x.content),['A-secret']);
  for(const route of ['/kernel/inspect','/kernel/status','/summary']) {
    const result=await request(a,'/api/core'+route);assert.equal(result.status,200,JSON.stringify(result));
    assert(!JSON.stringify(result.data).includes('B-kernel-secret'));assert(!JSON.stringify(result.data).includes('unowned-kernel-secret'));
  }
});
test('personal model operations fail closed without scope and resist query operators',async()=>{
  const fs=require('node:fs');
  const ownedModels=fs.readdirSync(path.resolve(__dirname,'../models')).filter(file=>file.endsWith('.js') && fs.readFileSync(path.resolve(__dirname,'../models',file),'utf8').includes("plugin(require('./coreOwned')"));
  assert.equal(ownedModels.length,26);
  for(const Model of ownedModels.map(file=>require('../models/'+file))) {
    for(const operation of [()=>Model.find(),()=>Model.countDocuments(),()=>Model.updateMany({},{$set:{source:'x'}}),()=>Model.deleteMany({}),()=>Model.aggregate([{$match:{}}])]) await assert.rejects(operation,/scope/i);
  }
  await assert.rejects(()=>scope(a,()=>SignalEntry.create({userId:b.id,sleep:1})),/owner/i);
  await assert.rejects(()=>scope(a,()=>Task.find({userId:b.id})),/owner/i);
  await assert.rejects(()=>scope(a,()=>Task.updateMany({},{$set:{userId:b.id}})),/ownership/i);
  await assert.rejects(()=>scope(a,()=>Task.aggregate([{$unionWith:'tasks'}])),/aggregation/i);
  const values=await scope(a,()=>SignalEntry.find({$or:[{userId:b.id},{notes:'A-only'}]}));
  assert(values.every(x=>String(x.userId)===a.id));
  await assert.rejects(()=>scope(a,()=>Task.bulkWrite([{deleteMany:{filter:{}}}])),/Bulk writes/);
});
test('manual kernel and authenticated background cycle only write their owner',async()=>{
  const r=await request(a,'/api/core/agent/evaluate','POST',{text:'Plan my next work session',context:{recentCommands:['stale-cached-secret'],lastOverlayResult:{summary:'stale-cached-secret'}}});
  assert.equal(r.status,200,JSON.stringify(r));assert(!JSON.stringify(r.data).includes('stale-cached-secret'));
  const before=await KernelCycle.collection.countDocuments({userId:new mongoose.Types.ObjectId(b.id)});
  await runAuthenticatedCoreJob({userId:a.id,sessionId:a.sid},()=>core.m1Internals.runAgentLoopCycle());
  assert.equal(await KernelCycle.collection.countDocuments({userId:new mongoose.Types.ObjectId(b.id)}),before);
  assert(await scope(a,()=>KernelCycle.countDocuments())>0);
  for(let i=0;i<4;i++) await scope(a,()=>require('../services/coreContextService').createTask({description:'Medium urgency fixture '+i}));
  const actionRun=await request(a,'/api/core/agent/evaluate','POST',{text:'Plan the next task'});
  assert.equal(actionRun.status,200,JSON.stringify(actionRun));assert(actionRun.data.tasks_created.length>0,JSON.stringify(actionRun.data));
  assert(actionRun.data.action_results.filter(x=>x.action_name==='createTask').every(x=>x.success));
  assert((await scope(a,()=>require('../models/ActionExecution').find())).every(x=>String(x.userId)===a.id));
});
test('scope-safe write pause denies HTTP/direct/jobs while preserving scoped reads',async()=>{
  process.env.CORE_CONTEXT_WRITES_ENABLED='false';
  try {
    assert.equal((await request(a,'/api/core/tasks','POST',{description:'paused'})).status,503);
    await assert.rejects(()=>scope(a,()=>Task.create({description:'paused'})),/paused/);
    await assert.rejects(()=>runAuthenticatedCoreJob({userId:a.id,sessionId:a.sid},()=>core.m1Internals.runAgentLoopCycle()),/paused/);
    assert.equal((await request(a,'/api/core/tasks')).status,200);
    await assert.rejects(()=>Task.find(),/scope/);
  } finally {process.env.CORE_CONTEXT_WRITES_ENABLED='true';}
});
test('referenced personal records cannot cross users',async()=>{
  const system=await scope(b,()=>System.create({name:'B-private-system'}));
  await assert.rejects(()=>scope(a,()=>SystemExecution.create({systemId:system._id,systemName:'B'})),/Referenced record/);
  const result=await request(a,'/api/core/systems/'+system._id,'PUT',{purpose:'overwrite'});
  assert.equal((await scope(b,()=>System.findById(system._id))).purpose,undefined);
  assert([200,404].includes(result.status));
  const Protocol=require('../models/Protocol');const foreign=await scope(b,()=>Protocol.create({name:'B protocol'}));
  await assert.rejects(()=>scope(a,()=>Task.create({description:'cross ref',protocol_id:foreign._id})),/Referenced record/);
  const local=await scope(a,()=>Task.create({description:'own task'}));
  local.protocol_id=foreign._id;
  await assert.rejects(()=>scope(a,()=>local.save({validateBeforeSave:false})),/Referenced record/);
  const cycle=await scope(b,()=>KernelCycle.create({output:{summary:'B'}}));
  await assert.rejects(()=>scope(a,()=>require('../models/ActionExecution').create({action_name:'fixture',reasoning_cycle_id:cycle._id})),/Referenced record/);
});
test('no ownerless background cycle, boot restoration, revoked session or operator data override',async()=>{
  await AgentLoopState.collection.insertOne({singletonKey:'primary',active:true,latest_agent_summary:'legacy-global'});
  assert.equal((await core.m1Internals.restoreAgentLoopOnBoot()).restored,false);
  await assert.rejects(()=>core.m1Internals.runAgentLoopCycle(),/scope/i);
  await assert.rejects(()=>runAuthenticatedCoreJob(null,()=>Task.find()),/scope/i);
  await assert.rejects(()=>scope(a,()=>Task.find({userId:b.id})),/owner/i);
  const expired=await fixtureUser('expired','COMMANDER_IN_CHIEF');
  await AuthSession.updateOne({sessionId:expired.sid},{$set:{revokedAt:new Date()}});
  let ran=false;await assert.rejects(()=>runAuthenticatedCoreJob({userId:expired.id,sessionId:expired.sid},()=>{ran=true;}),/authorized/i);assert.equal(ran,false);
  const own=await runAuthenticatedCoreJob({userId:a.id,sessionId:a.sid},()=>SignalEntry.find());assert(own.every(x=>String(x.userId)===a.id));
  assert.equal(await Task.collection.countDocuments({description:'unexpected-job'}),0);
  assert.equal((await AgentLoopState.collection.findOne({singletonKey:'primary'})).active,true);
});
