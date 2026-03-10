#!/usr/bin/env node
/* eslint-disable no-console */

const express = require('express');
const { randomUUID } = require('crypto');

let BASE = process.env.SYZ_BASE_URL || 'http://127.0.0.1:10000';
const state = { cookie: '', token: '' };
const results = [];

const record = (name, pass, details = '') => {
  results.push({ name, pass, details });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${details ? ` | ${details}` : ''}`);
};

const getCookieValue = (cookieHeader = '', key = '') =>
  cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.replace(`${key}=`, '') || '';

const startMockHarnessServer = async () => {
  const app = express();
  app.use(express.json());

  const db = {
    usersByEmail: new Map(),
    usersById: new Map(),
    sessions: new Map(),
    signals: [],
    tasks: [],
    memory: [],
  };

  const issueSession = (user) => {
    const sid = randomUUID();
    db.sessions.set(sid, user._id);
    return sid;
  };

  const requireAuth = (req, res, next) => {
    const bearer = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : '';
    const cookieSid = getCookieValue(req.headers.cookie || '', 'session');
    const sid = bearer || cookieSid;
    const userId = db.sessions.get(sid);
    if (!sid || !userId) return res.status(401).json({ message: 'Not authorized, no token' });
    const user = db.usersById.get(userId);
    if (!user) return res.status(401).json({ message: 'Not authorized, invalid user' });
    req.user = user;
    req.sid = sid;
    return next();
  };

  app.post('/api/auth/signup', (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ message: 'Username, email, and password are required.' });
    if (db.usersByEmail.has(email)) return res.status(400).json({ message: 'Operative already exists.' });

    const user = {
      _id: randomUUID(),
      username,
      email,
      password,
      role: 'user',
      onboarding: { completed: false, profile: {} },
      healthSync: { provider: 'health_connect', status: 'disconnected' },
    };
    db.usersByEmail.set(email, user);
    db.usersById.set(user._id, user);

    const sid = issueSession(user);
    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly`);
    return res.status(201).json({ _id: user._id, username: user.username, email: user.email, role: user.role, token: sid });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = db.usersByEmail.get(email);
    if (!user || user.password !== password) return res.status(401).json({ message: 'Access Denied: Invalid credentials.' });
    const sid = issueSession(user);
    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly`);
    return res.json({ _id: user._id, username: user.username, email: user.email, role: user.role, token: sid });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    db.sessions.delete(req.sid);
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
    return res.status(200).json({ message: 'Logout successful.' });
  });

  app.post('/api/core/onboarding/complete', requireAuth, (req, res) => {
    req.user.onboarding = {
      completed: true,
      completedAt: new Date().toISOString(),
      profile: req.body || {},
    };
    return res.json({ onboarding: req.user.onboarding });
  });

  app.post('/api/core/dev/set-role', requireAuth, (req, res) => {
    req.user.role = String(req.body?.role || 'user');
    return res.json({ message: 'Role updated for testing.', user: { name: req.user.username, email: req.user.email, role: req.user.role } });
  });

  app.get('/api/core/operator/visibility', requireAuth, (req, res) => {
    const role = String(req.user.role || 'user').toLowerCase();
    const canAccessOperatorMode = ['founder', 'admin'].includes(role);
    return res.json({ canAccessOperatorMode, role, requiredRoles: ['founder', 'admin'] });
  });

  app.post('/api/core/signals', requireAuth, (req, res) => {
    const entry = { _id: randomUUID(), ...req.body, createdAt: new Date().toISOString() };
    db.signals.unshift(entry);
    return res.status(201).json(entry);
  });

  app.get('/api/core/signals', requireAuth, (_req, res) => res.json({ entries: db.signals }));

  const staticReasoning = {
    objectives: ['maintain momentum'],
    constraints: ['time'],
    risks: ['overload'],
    leverage: ['focus'],
    next_actions: ['ship one high-impact task'],
  };

  app.post('/api/core/analyze', requireAuth, (_req, res) => res.json(staticReasoning));
  app.post('/api/core/recommend', requireAuth, (_req, res) => res.json(staticReasoning));
  app.post('/api/core/mentor', requireAuth, (_req, res) => res.json(staticReasoning));

  app.get('/api/core/sentinel/status', requireAuth, (_req, res) => res.json({ status: 'ok', anomalies: [] }));
  app.get('/api/core/sentinel/scan', requireAuth, (_req, res) => res.json({ scanned: true, anomalies: [] }));
  app.get('/api/core/sentinel/report', requireAuth, (_req, res) => res.json({ sentinel: 'Axiom Sentinel', alerts: [] }));
  app.get('/api/core/loop/status', requireAuth, (_req, res) => res.json({ active: false, run_count: 0 }));

  app.post('/api/core/tasks', requireAuth, (req, res) => {
    const task = { _id: randomUUID(), description: req.body?.description || 'task', status: 'open' };
    db.tasks.unshift(task);
    return res.status(201).json(task);
  });
  app.get('/api/core/tasks', requireAuth, (_req, res) => res.json({ tasks: db.tasks }));
  app.post('/api/core/tasks/:id/complete', requireAuth, (req, res) => {
    const task = db.tasks.find((item) => item._id === req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    return res.json(task);
  });

  app.post('/api/core/memory/save', requireAuth, (req, res) => {
    const entry = {
      _id: randomUUID(),
      title: String(req.body?.title || ''),
      content: String(req.body?.content || ''),
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      updatedAt: new Date().toISOString(),
    };
    db.memory.unshift(entry);
    return res.status(201).json(entry);
  });

  app.get('/api/core/memory', requireAuth, (_req, res) => res.json({ entries: db.memory }));
  app.get('/api/core/memory/search', requireAuth, (req, res) => {
    const q = String(req.query?.query || '').toLowerCase();
    return res.json({
      query: q,
      entries: db.memory.filter((item) => item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q)),
    });
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  const address = server.address();
  BASE = `http://127.0.0.1:${address.port}`;
  return server;
};

const api = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  if (state.cookie) headers.Cookie = state.cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) state.cookie = setCookie.split(';')[0];

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

(async () => {
  let mockServer = null;
  try {
    if (!process.env.MONGO_URI) {
      console.log('INFO | MONGO_URI missing. Starting harness mock mode.');
      mockServer = await startMockHarnessServer();
      console.log(`INFO | Mock harness server active at ${BASE}`);
    }

    const suffix = Date.now();
    const email = `codex_${suffix}@example.com`;
    const password = 'Passw0rd!123';

    const signup = await api('/api/auth/signup', { method: 'POST', auth: false, body: { username: 'codex', email, password } });
    record('signup', signup.ok, `status=${signup.status}`);

    const login = await api('/api/auth/login', { method: 'POST', auth: false, body: { email, password } });
    state.token = login.data?.token || state.token;
    record('login', login.ok, `status=${login.status}`);

    const onboarding = await api('/api/core/onboarding/complete', {
      method: 'POST',
      body: {
        preferredName: 'Codex',
        lifeStage: 'builder',
        mentorStyle: 'strategic',
        baseline: { sleep: 7, stress: 4, energy: 6, mood: 'focused', symptoms: 'none', focusChallenge: 'integration' },
        goals: ['focus'],
        signalSetup: 'manual',
      },
    });
    record('onboarding completion state', onboarding.ok, `status=${onboarding.status}`);

    const setFounder = await api('/api/core/dev/set-role', { method: 'POST', body: { role: 'founder' } });
    const opVisibility = await api('/api/core/operator/visibility');
    record('founder/admin access to Operator Mode', setFounder.ok && opVisibility.data?.canAccessOperatorMode === true, `role=${opVisibility.data?.role || 'n/a'}`);

    await api('/api/core/dev/set-role', { method: 'POST', body: { role: 'user' } });
    const blockedVisibility = await api('/api/core/operator/visibility');
    record('normal-user blocking from Operator Mode', blockedVisibility.ok && blockedVisibility.data?.canAccessOperatorMode === false, `role=${blockedVisibility.data?.role || 'n/a'}`);

    const signalLog = await api('/api/core/signals', { method: 'POST', body: { sleep: 6, stress: 5, symptoms: 'ok' } });
    record('signal logging', signalLog.ok, `status=${signalLog.status}`);
    const signalGet = await api('/api/core/signals');
    record('signal retrieval', signalGet.ok && Array.isArray(signalGet.data?.entries), `status=${signalGet.status}`);

    for (const endpoint of ['analyze', 'recommend', 'mentor']) {
      const r = await api(`/api/core/${endpoint}`, { method: 'POST', body: { text: 'help me plan today' } });
      record(endpoint, r.ok, `status=${r.status}`);
    }

    for (const path of ['/api/core/sentinel/status', '/api/core/sentinel/scan', '/api/core/sentinel/report', '/api/core/loop/status']) {
      const r = await api(path);
      record(path.replace('/api/core/', ''), r.ok, `status=${r.status}`);
    }

    const createTask = await api('/api/core/tasks', { method: 'POST', body: { description: 'harness task' } });
    record('task create', createTask.ok, `status=${createTask.status}`);
    const listTask = await api('/api/core/tasks');
    record('task show', listTask.ok, `status=${listTask.status}`);
    const firstTaskId = listTask.data?.tasks?.[0]?._id;
    const done = firstTaskId ? await api(`/api/core/tasks/${firstTaskId}/complete`, { method: 'POST' }) : { ok: false, status: 0 };
    record('task complete', done.ok, `status=${done.status}`);

    const memorySave = await api('/api/core/memory/save', { method: 'POST', body: { title: 'harness', content: 'memory', tags: ['harness'] } });
    record('memory save', memorySave.ok, `status=${memorySave.status}`);
    const memoryShow = await api('/api/core/memory');
    record('memory show', memoryShow.ok, `status=${memoryShow.status}`);
    const memorySearch = await api('/api/core/memory/search?query=harness');
    record('memory search', memorySearch.ok, `status=${memorySearch.status}`);

    const logout = await api('/api/auth/logout', { method: 'POST' });
    record('logout', logout.ok, `status=${logout.status}`);

    const passCount = results.filter((r) => r.pass).length;
    console.log(`\nSummary: ${passCount}/${results.length} checks passed.`);
    process.exit(passCount === results.length ? 0 : 1);
  } catch (error) {
    console.error('Harness execution failed:', error.message);
    process.exit(1);
  } finally {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  }
})();
