#!/usr/bin/env node
/* eslint-disable no-console */
const BASE = process.env.SYZ_BASE_URL || 'http://127.0.0.1:10000';

const state = { cookie: '', token: '' };
const results = [];

const record = (name, pass, details = '') => {
  results.push({ name, pass, details });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${details ? ` | ${details}` : ''}`);
};

const api = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  if (state.cookie) headers.Cookie = state.cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) state.cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

(async () => {
  const suffix = Date.now();
  const email = `codex_${suffix}@example.com`;
  const password = 'Passw0rd!123';

  const signup = await api('/api/auth/signup', { method: 'POST', auth: false, body: { username: 'codex', email, password } });
  record('signup', signup.ok, `status=${signup.status}`);

  const login = await api('/api/auth/login', { method: 'POST', auth: false, body: { email, password } });
  state.token = login.data?.token || '';
  record('login', login.ok, `status=${login.status}`);

  const onboarding = await api('/api/core/onboarding/complete', { method: 'POST', body: { preferredName: 'Codex', lifeStage: 'builder', mentorStyle: 'strategic', baseline: { sleep: 7, stress: 4, energy: 6, mood: 'focused', symptoms: 'none', focusChallenge: 'integration' }, goals: ['focus'], signalSetup: 'manual' } });
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
})().catch((error) => {
  console.error('Harness execution failed:', error.message);
  process.exit(1);
});
