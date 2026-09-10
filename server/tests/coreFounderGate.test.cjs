const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'synthetic-founder-gate-fixture', CORE_CONTEXT_WRITES_ENABLED: 'true' });
delete process.env.CORE_CONTEXT_WRITE_USER_IDS;
delete process.env.CORE_PERSONAL_EXECUTION_ENABLED;
delete process.env.MONGO_URI;
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../../.cache/mongodb-binaries');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { runWithRequestContext } = require('../utils/requestContext');
const { requireCoreWrite, requireCoreExecution, readCoreRuntime, runAuthenticatedCoreJob } = require('../services/coreScopeService');
const context = require('../services/coreContextService');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const LifeContext = require('../models/LifeContext');
const Memory = require('../models/Memory');
const Task = require('../models/Task');
const AgentLoopState = require('../models/AgentLoopState');
const StrategicMemory = require('../models/StrategicMemory');
require('../services/modelRouter').requestModelJson = async () => { throw new Error('Unexpected provider execution'); };
const core = require('../routes/API/coreRoutes');
let database, server, base, founder, otherOperator, regular, fact, task, goal;
let recording = false;
const writes = [];
const mutating = new Set(['insert', 'update', 'delete', 'findAndModify', 'bulkWrite', 'create', 'createIndexes', 'drop', 'dropIndexes', 'collMod', 'commitTransaction']);
const scope = (user, callback) => runWithRequestContext({ userId: user.id, sessionId: user.sid, authenticated: true }, callback);
const paused = error => error.statusCode === 503 && error.code === 'CORE_SCOPE_REQUIRED';
async function request(user, route, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function makeUser(name, role) {
  const user = await User.create({ name, username: name, email: name + '@example.test', password: 'fixture-hash', role });
  const sid = 'founder-gate-' + name;
  await AuthSession.create({ userId: user._id, sessionId: sid, expiresAt: new Date(Date.now() + 600000) });
  return { id: String(user._id), sid, token: jwt.sign({ id: String(user._id), sid }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
}
async function zeroWrites(callback) {
  writes.length = 0; recording = true;
  try { await callback(); } finally { recording = false; }
  assert.deepEqual(writes, [], 'Denied request issued MongoDB mutations');
}
before(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1, dbName: 'founder_gate_fixtures' } });
  await mongoose.connect(database.getUri(), { monitorCommands: true, autoIndex: false, autoCreate: false });
  await LifeContext.createIndexes(); await Memory.createIndexes();
  founder = await makeUser('approved-founder', 'COMMANDER_IN_CHIEF');
  otherOperator = await makeUser('unapproved-operator', 'COMMANDER_IN_CHIEF');
  regular = await makeUser('unapproved-user', 'USER');
  process.env.CORE_CONTEXT_WRITE_USER_IDS = founder.id;
  await AgentLoopState.collection.insertOne({ singletonKey: 'primary', active: true, latest_agent_summary: 'ownerless-history' });
  mongoose.connection.getClient().on('commandStarted', event => {
    if (recording && mutating.has(event.commandName)) writes.push(event.commandName);
  });
  const app = express(); app.use(express.json());
  app.use('/api/core', require('../routes/coreContextRoutes')); app.use('/api/core', core);
  app.use('/api/memory', require('../routes/memoryRoutes'));
  app.use('/api/mentor-system', require('../routes/mentorSystemRoutes'));
  app.use((error, _req, res, _next) => res.status(error.statusCode || error.status || (res.statusCode >= 400 ? res.statusCode : 500)).json({ code: error.code, message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); if (database) await database.stop(); });

test('global true alone, malformed lists and role names never authorize writes', async () => {
  await zeroWrites(async () => {
    for (const list of [undefined, '', '*', 'COMMANDER_IN_CHIEF', 'founder@example.test', founder.id + ',*', founder.id + ',', JSON.stringify([founder.id])]) {
      if (list === undefined) delete process.env.CORE_CONTEXT_WRITE_USER_IDS;
      else process.env.CORE_CONTEXT_WRITE_USER_IDS = list;
      await assert.rejects(() => scope(founder, requireCoreWrite), paused);
      assert.equal((await request(founder, '/api/core/context', 'PUT', { goals: ['must not persist'] })).status, 503);
    }
    process.env.CORE_CONTEXT_WRITE_USER_IDS = ' ' + founder.id.toUpperCase() + ' ';
    await scope(founder, requireCoreWrite);
    for (const flag of [undefined, 'false', 'TRUE', '1']) {
      if (flag === undefined) delete process.env.CORE_CONTEXT_WRITES_ENABLED;
      else process.env.CORE_CONTEXT_WRITES_ENABLED = flag;
      await assert.rejects(() => scope(founder, requireCoreWrite), paused);
    }
  });
  process.env.CORE_CONTEXT_WRITES_ENABLED = 'true';
  process.env.CORE_CONTEXT_WRITE_USER_IDS = founder.id;
  assert.throws(() => requireCoreWrite(), /scope/i);
});

test('only the approved ID can persist a complete non-wellness context with execution disabled', async () => {
  const response = await request(founder, '/api/core/context', 'PUT', {
    goals: [{ description: 'Publish an independent design portfolio', domain: 'creative', successMeasure: 'Publish three case studies' }],
    constraints: [{ description: 'Four hours per week', kind: 'time', hard: true }],
    resources: [{ description: 'Existing design archive', kind: 'asset' }],
  });
  assert.equal(response.status, 200, JSON.stringify(response)); goal = response.data.goals[0];
  assert.equal((await request(founder, '/api/core/context')).data.authority, 'LifeContext');
  assert.equal(response.data.constraints[0].description, 'Four hours per week');
  assert.equal(response.data.resources[0].description, 'Existing design archive');
  const saved = await request(founder, '/api/core/memory/save', 'POST', { content: 'Portfolio contains two completed case studies', sourceCommand: 'Founder-provided portfolio inventory', category: 'creative' });
  assert.equal(saved.status, 200); fact = saved.data;
  assert.equal(fact.source, 'user'); assert.equal(fact.sourceCommand, 'Founder-provided portfolio inventory');
  const observation = await request(founder, '/api/core/signals', 'POST', { domain: 'business', observationType: 'client-inquiry', value: 1, source: 'user', sourceId: 'founder-fixture-inquiry' });
  assert.equal(observation.status, 200);
  assert.equal(observation.data.userId, founder.id);
  assert.equal(await LifeContext.collection.countDocuments({}), 1);
  assert.equal((await LifeContext.collection.findOne({})).user_id.toString(), founder.id);
  await scope(founder, () => assert.equal(readCoreRuntime('loop'), undefined));
});

test('second authenticated session preserves context and corrected memory without legacy resurrection', async () => {
  const sid = 'second-approved-founder-session';
  await AuthSession.create({ userId: founder.id, sessionId: sid, expiresAt: new Date(Date.now() + 600000) });
  const next = { ...founder, sid, token: jwt.sign({ id: founder.id, sid }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
  const read = await request(next, '/api/core/context');
  assert.equal(read.status, 200); assert.equal(read.data.goals[0]._id, goal._id);
  assert.equal(read.data.goals[0].successMeasure, 'Publish three case studies');
  assert.equal((await request(next, '/api/core/signals')).data.entries[0].sourceId, 'founder-fixture-inquiry');
  await User.updateOne({ _id: founder.id }, { $set: { 'onboarding.profile.sovereignMatrixNote': fact.content } });
  await scope(founder, () => Memory.findOneAndUpdate({}, { $set: { conversationHistory: [{ role: 'model', text: fact.content }] } }, { upsert: true }));
  const corrected = await request(next, '/api/core/memory/' + fact._id, 'PATCH', { content: 'Portfolio contains three completed case studies' });
  assert.equal(corrected.status, 200); assert.equal(corrected.data.source, 'user-correction');
  for (const route of ['/api/core/context', '/api/core/memory', '/api/memory', '/api/core/onboarding/status', '/api/mentor-system/intake']) {
    const result = await request(next, route); assert.equal(result.status, 200, route);
    assert(!JSON.stringify(result.data).includes(fact.content), route);
  }
  assert.equal((await request(next, '/api/core/memory')).data.entries[0].content, corrected.data.content);
});

test('explicit canonical task creation and update retain founder ownership', async () => {
  const created = await request(founder, '/api/core/tasks', 'POST', { description: 'Draft the first portfolio case study', source: 'user' });
  assert.equal(created.status, 200); task = created.data;
  assert.equal(task.userId, founder.id);
  const completed = await request(founder, '/api/core/tasks/' + task._id + '/complete', 'POST');
  assert.equal(completed.status, 200); assert.equal(completed.data.status, 'done');
  assert.equal(completed.data.userId, founder.id);
});

test('unlisted users and another operator cannot write, read, reference or delete founder records', async () => {
  const before = JSON.stringify(await LifeContext.collection.findOne({ user_id: new mongoose.Types.ObjectId(founder.id) }));
  const ownedModels = require('node:fs').readdirSync(path.resolve(__dirname, '../models')).filter(file => file.endsWith('.js') && require('node:fs').readFileSync(path.resolve(__dirname, '../models', file), 'utf8').includes("plugin(require('./coreOwned')"));
  assert.equal(ownedModels.length, 28);
  await zeroWrites(async () => {
    for (const user of [regular, otherOperator]) {
      await assert.rejects(() => scope(user, requireCoreWrite), paused);
      const empty = await request(user, '/api/core/context');
      assert.equal(empty.status, 200); assert.equal(empty.data.goals.length, 0);
      assert.deepEqual((await request(user, '/api/core/memory')).data.entries, []);
      assert.deepEqual((await request(user, '/api/core/tasks')).data.tasks, []);
      for (const [route, method, body] of [
        ['/api/core/context', 'PUT', { goals: [goal] }], ['/api/core/context', 'DELETE'],
        ['/api/core/memory/' + fact._id, 'PATCH', { content: 'stolen' }], ['/api/core/memory/' + fact._id, 'DELETE'],
        ['/api/core/tasks', 'POST', { description: 'unauthorized' }],
        ['/api/core/signals', 'POST', { domain: 'business', value: 99 }],
      ]) assert.equal((await request(user, route, method, body)).status, 503, route);
      assert.equal((await request(user, '/api/core/tasks/' + task._id + '/complete', 'POST')).status, 404);
      for (const file of ownedModels) await assert.rejects(() => scope(user, () => require('../models/' + file).updateMany({}, { $set: { source: 'unauthorized' } })), paused);
      assert.equal(await scope(user, () => StrategicMemory.findById(fact._id)), null);
    }
  });
  assert.equal(JSON.stringify(await LifeContext.collection.findOne({ user_id: new mongoose.Types.ObjectId(founder.id) })), before);
});

test('context approval never enables loop, kernel, action tools or background callbacks', async () => {
  const before = JSON.stringify(await AgentLoopState.collection.find({}).toArray());
  await zeroWrites(async () => {
    for (const route of ['/loop/start', '/agent', '/agent/evaluate', '/systems/run', '/systems/automate']) {
      const response = await request(founder, '/api/core' + route, 'POST', { text: 'execute plan', name: 'test' });
      assert.equal(response.status, 503, JSON.stringify(response));
      assert.match(response.data.message, /execution is paused/);
    }
    await assert.rejects(() => scope(founder, () => core.m1Internals.runAgentLoopCycle()), paused);
    let called = false;
    await assert.rejects(() => scope(founder, () => require('../logic/actionKernel').executeActionPlan({ policy: { queued: [{ action_name: 'fixture' }] }, toolRegistry: { fixture: () => { called = true; } } })), paused);
    await assert.rejects(() => runAuthenticatedCoreJob({ userId: founder.id, sessionId: founder.sid }, () => { called = true; }), paused);
    assert.equal(called, false);
    await scope(founder, () => assert.equal(readCoreRuntime('loop'), undefined));
    assert.equal((await core.m1Internals.restoreAgentLoopOnBoot()).restored, false);
  });
  assert.equal(JSON.stringify(await AgentLoopState.collection.find({}).toArray()), before);
});

test('approval withdrawal is enforced at writes and every job tick, including with execution flag true', async () => {
  // Synthetic fixture only; no real loop or provider executes here.
  process.env.CORE_PERSONAL_EXECUTION_ENABLED = 'true';
  let calls = 0;
  await runAuthenticatedCoreJob({ userId: founder.id, sessionId: founder.sid }, () => { calls++; });
  await zeroWrites(async () => {
    await assert.rejects(() => runAuthenticatedCoreJob({ userId: otherOperator.id, sessionId: otherOperator.sid }, () => { calls++; }), paused);
    process.env.CORE_CONTEXT_WRITE_USER_IDS = '';
    await assert.rejects(() => runAuthenticatedCoreJob({ userId: founder.id, sessionId: founder.sid }, () => { calls++; }), paused);
    await assert.rejects(() => scope(founder, requireCoreExecution), paused);
    await assert.rejects(() => scope(founder, () => Task.create({ description: 'must not persist after withdrawal' })), paused);
  });
  assert.equal(calls, 1);
  process.env.CORE_CONTEXT_WRITE_USER_IDS = founder.id;
  delete process.env.CORE_PERSONAL_EXECUTION_ENABLED;
});

