const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'synthetic-loop-read-fixture-secret';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../../.cache/mongodb-binaries');
delete process.env.MONGO_URI;
delete process.env.CORE_CONTEXT_WRITES_ENABLED;
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const { runWithRequestContext } = require('../utils/requestContext');
const { readCoreRuntime } = require('../services/coreScopeService');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const AgentLoopState = require('../models/AgentLoopState');
const SocialCampaign = require('../models/SocialCampaign');
require('../services/modelRouter').requestModelJson = async () => { throw new Error('Unexpected model call during a read'); };
const core = require('../routes/API/coreRoutes');
const publishing = require('../social/publishingService');
const originalPublish = publishing.publishPost;
const dispatches = [];
publishing.publishPost = async args => { dispatches.push(args); return { fixture: true }; };
delete require.cache[require.resolve('../social/schedulingService')];
const { processDuePosts } = require('../social/schedulingService');
publishing.publishPost = originalPublish;
let mongod, server, base, a, b, c, regular, recording = false;
const mutations = [];
const mutationCommands = new Set(['insert', 'update', 'delete', 'findAndModify', 'bulkWrite', 'create', 'createIndexes', 'drop', 'dropIndexes', 'collMod', 'renameCollection', 'commitTransaction']);
const scope = (user, callback) => runWithRequestContext({ userId: user.id, sessionId: user.sid, authenticated: true }, callback);
const snapshot = async () => JSON.stringify(await AgentLoopState.collection.find({}).sort({ _id: 1 }).toArray());
async function zeroWrites(callback) {
  mutations.length = 0;
  recording = true;
  try { await callback(); } finally { recording = false; }
  assert.deepEqual(mutations, [], 'Read/pause path issued a MongoDB mutation');
}
async function request(user, route, method = 'GET') {
  const response = await fetch(base + route, { method, headers: user ? { Authorization: 'Bearer ' + user.token } : {} });
  return { status: response.status, data: await response.json() };
}
async function fixtureUser(name, role = 'COMMANDER_IN_CHIEF') {
  const user = await User.create({ name, username: name, email: name + '@example.test', password: 'synthetic-fixture-hash', role });
  const sid = 'fixture-' + name;
  await AuthSession.create({ userId: user._id, sessionId: sid, expiresAt: new Date(Date.now() + 600000) });
  return { id: String(user._id), sid, token: jwt.sign({ id: String(user._id), sid }, process.env.JWT_SECRET, { expiresIn: '10m' }) };
}
before(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, dbName: 'loop_read_fixtures' } });
  await mongoose.connect(mongod.getUri(), { monitorCommands: true, autoIndex: false, autoCreate: false });
  mongoose.connection.getClient().on('commandStarted', event => {
    if (recording && mutationCommands.has(event.commandName)) mutations.push(event.commandName);
  });
  a = await fixtureUser('read-a'); b = await fixtureUser('read-b'); c = await fixtureUser('read-c');
  process.env.CORE_CONTEXT_WRITE_USER_IDS = [a.id, b.id, c.id].join(',');
  delete process.env.CORE_PERSONAL_EXECUTION_ENABLED;
  regular = await fixtureUser('read-regular', 'USER');
  await AgentLoopState.collection.insertMany([
    { singletonKey: 'primary', active: true, latest_agent_summary: 'historical-secret' },
    { singletonKey: 'user:' + b.id, userId: new mongoose.Types.ObjectId(b.id), active: true, run_count: 7, latest_agent_summary: 'owned-b-secret' },
    { singletonKey: 'user:' + a.id, userId: new mongoose.Types.ObjectId(b.id), active: true, latest_agent_summary: 'foreign-key-secret' },
    { singletonKey: 'user:' + c.id, active: true, latest_agent_summary: 'ownerless-key-secret' },
  ]);
  const app = express(); app.use(express.json()); app.use('/api/core', core);
  app.use((error, _req, res, _next) => res.status(error.statusCode || error.status || (res.statusCode >= 400 ? res.statusCode : 500)).json({ code: error.code, message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api/core';
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (mongod) await mongod.stop();
});

test('paused loop start preserves HTTP 503 and maintenance reason without writes', async () => {
  const before = await snapshot();
  for (const value of [undefined, 'false']) {
    if (value === undefined) delete process.env.CORE_CONTEXT_WRITES_ENABLED;
    else process.env.CORE_CONTEXT_WRITES_ENABLED = value;
    await zeroWrites(async () => {
      const result = await request(a, '/loop/start', 'POST');
      assert.equal(result.status, 503, JSON.stringify(result));
      assert.equal(result.data.code, 'CORE_SCOPE_REQUIRED');
      assert.match(result.data.message, /Personal Core (writes|jobs) are paused for maintenance/);
      assert.equal(result.data.details, result.data.message);
    });
  }
  assert.equal(await snapshot(), before);
});

test('missing owned status and summary are successful, idempotent, zero-write reads in every flag mode', async () => {
  const before = await snapshot();
  for (const value of [undefined, 'false', 'true']) {
    // This flag only controls the isolated local fixture database.
    if (value === undefined) delete process.env.CORE_CONTEXT_WRITES_ENABLED;
    else process.env.CORE_CONTEXT_WRITES_ENABLED = value;
    for (const user of [a, c]) await zeroWrites(async () => {
      let previous;
      for (let repeat = 0; repeat < 3; repeat++) {
        const status = await request(user, '/loop/status');
        const summary = await request(user, '/summary');
        assert.equal(status.status, 200, JSON.stringify(status));
        assert.equal(summary.status, 200, JSON.stringify(summary));
        for (const payload of [status.data, summary.data.loop_status]) {
          assert.equal(payload.active, false); assert.equal(payload.run_count, 0);
          assert.equal(payload.last_run_at, null); assert.equal(payload.latest_agent_summary, '');
        }
        assert.equal(summary.data.autonomy_status.last_monitor_run, null);
        assert(!JSON.stringify([status, summary]).includes('secret'));
        if (previous) assert.deepEqual([status, summary], previous);
        previous = [status, summary];
        scope(user, () => {
          assert.equal(readCoreRuntime('loop'), undefined);
          assert.equal(readCoreRuntime('autonomy'), undefined);
        });
      }
    });
  }
  delete process.env.CORE_CONTEXT_WRITES_ENABLED;
  assert.equal(await snapshot(), before);
  assert.equal(await AgentLoopState.collection.countDocuments({ userId: { $in: [new mongoose.Types.ObjectId(a.id), new mongoose.Types.ObjectId(c.id)] } }), 0);
});

test('owned persisted state is scoped and does not restore or initialize a runtime', async () => {
  const before = await snapshot();
  await zeroWrites(async () => {
    for (const route of ['/loop/status', '/summary']) {
      const response = await request(b, route);
      assert.equal(response.status, 200);
      const result = route === '/summary' ? response.data.loop_status : response.data;
      assert.equal(result.active, false); assert.equal(result.run_count, 7);
      assert.equal(result.latest_agent_summary, 'owned-b-secret');
      assert(!JSON.stringify(response).includes('historical-secret'));
      scope(b, () => assert.equal(readCoreRuntime('loop'), undefined));
    }
  });
  assert.equal(await snapshot(), before);
});

test('boot never restores historical active state and preserves every record', async () => {
  const before = await snapshot();
  await zeroWrites(async () => {
    for (let repeat = 0; repeat < 3; repeat++) assert.equal((await core.m1Internals.restoreAgentLoopOnBoot()).restored, false);
  });
  assert.equal(await snapshot(), before);
  assert.equal((await AgentLoopState.collection.findOne({ singletonKey: 'primary' })).active, true);
});

test('loop and summary authentication and operator authorization remain enforced', async () => {
  for (const [route, method] of [['/loop/status', 'GET'], ['/summary', 'GET'], ['/loop/start', 'POST']]) {
    assert.equal((await request(null, route, method)).status, 401);
    // Summary has always been an authenticated scoped read; loop controls require operator capability.
    assert.equal((await request(regular, route, method)).status, route === '/summary' ? 200 : 403);
  }
});

test('Social scheduler still dispatches due posts while personal Core is paused', async () => {
  delete process.env.CORE_CONTEXT_WRITES_ENABLED;
  const past = new Date(Date.now() - 60000), future = new Date(Date.now() + 600000);
  const campaign = await SocialCampaign.create({ userId: b.id, name: 'Independent scheduler fixture', status: 'scheduled', posts: [
    { provider: 'meta', publishStatus: 'scheduled', scheduledTime: past },
    { provider: 'youtube', publishStatus: 'scheduled', scheduledTime: future },
    { provider: 'meta', publishStatus: 'published', scheduledTime: past, providerPostId: 'already-published' },
  ] });
  const before = JSON.stringify(await SocialCampaign.findById(campaign._id).lean());
  assert.equal((await request(a, '/loop/start', 'POST')).status, 503);
  assert.equal((await request(a, '/summary')).status, 200);
  const results = await processDuePosts();
  assert.equal(results.length, 1); assert.equal(dispatches.length, 1);
  assert.equal(String(dispatches[0].userId), b.id);
  assert.equal(String(dispatches[0].postId), String(campaign.posts[0]._id));
  // The publish boundary is mocked; no external provider calls or fixture status changes.
  assert.equal(JSON.stringify(await SocialCampaign.findById(campaign._id).lean()), before);
});
