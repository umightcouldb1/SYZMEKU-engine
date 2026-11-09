const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { LIMITS, createAnonymousAiBudget } = require('../services/anonymousAiBudget');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('anonymous prompt character and UTF-8 byte limits reject before provider', async () => {
  let calls = 0;
  const run = createAnonymousAiBudget();
  await assert.rejects(() => run('x'.repeat(4001), () => { calls++; }), { statusCode: 413 });
  const byteLimited = createAnonymousAiBudget({ limits: { ...LIMITS, promptBytes: 3 } });
  await assert.rejects(() => byteLimited('😀', () => { calls++; }), { statusCode: 413 });
  assert.equal(calls, 0);
});
test('request budget charges failed attempts and resets only after its window', async () => {
  let time = 0, calls = 0;
  const run = createAnonymousAiBudget({ limits: { ...LIMITS, requests: 1 }, now: () => time });
  await assert.rejects(() => run('a', async () => { calls++; throw Error('provider failed'); }));
  await assert.rejects(() => run('a', async () => { calls++; }), { statusCode: 429 });
  time = LIMITS.windowMs;
  assert.equal(await run('a', async () => { calls++; return 'ok'; }), 'ok');
  assert.equal(calls, 2);
});
test('concurrency rejects excess and releases after provider success or failure', async () => {
  const run = createAnonymousAiBudget({ limits: { ...LIMITS, concurrent: 1 } });
  let finish;
  const first = run('a', () => new Promise(resolve => { finish = resolve; }));
  await tick();
  await assert.rejects(() => run('b', async () => 'bad'), { statusCode: 429 });
  finish('ok'); assert.equal(await first, 'ok');
  await assert.rejects(() => run('c', async () => { throw Error('failure'); }));
  assert.equal(await run('d', async () => 'released'), 'released');
});
test('timeout aborts SDK signal, bounds output, and retains slot until upstream settles', async () => {
  const run = createAnonymousAiBudget({ limits: { ...LIMITS, concurrent: 1, timeoutMs: 10 } });
  let config, finish;
  await assert.rejects(() => run('a', options => { config = options; return new Promise(resolve => { finish = resolve; }); }), { statusCode: 504 });
  assert.equal(config.abortSignal.aborted, true);
  assert.equal(config.maxOutputTokens, 512);
  await assert.rejects(() => run('b', async () => 'bad'), { statusCode: 429 });
  finish('late'); await tick();
  assert.equal(await run('c', async () => 'ok'), 'ok');
});
test('disconnect cancels provider and cleans response listener', async () => {
  const run = createAnonymousAiBudget(); const response = new EventEmitter();
  let config;
  const pending = run('a', options => { config = options; return new Promise((_, reject) => options.abortSignal.addEventListener('abort', () => reject(Error('aborted')))); }, response);
  await tick(); response.emit('close');
  await assert.rejects(() => pending);
  assert.equal(config.abortSignal.aborted, true);
  assert.equal(response.listenerCount('close'), 0);
});
// Evaluate production modules with only their external boundaries substituted.
function loadFixture(relative, substitutes, extra = {}) {
  const file = path.resolve(__dirname, relative); const realRequire = createRequire(file);
  let source = fs.readFileSync(file, 'utf8');
  if (extra.importGemini) {
    const original = "import('@google/genai')";
    assert(source.includes(original));
    source = source.replace(original, 'importGemini()');
  }
  const context = { module: { exports: {} }, require: id => Object.hasOwn(substitutes, id) ? substitutes[id] : realRequire(id),
    process: { env: { GEMINI_API_KEY: 'synthetic-unused-test-key' } }, console: { error() {} }, AbortController, ...extra };
  vm.runInNewContext(source, context, { filename: file }); return context.module.exports;
}
test('controller bounds anonymous Gemini but leaves authenticated Gemini and commander unchanged', async () => {
  const gemini = [], ollama = [];
  const controller = loadFixture('../controllers/aiGatewayController.js', {
    'express-async-handler': fn => fn,
    axios: { post: async (...args) => { ollama.push(args); return { data: { response: 'local' } }; } },
    '../utils/audit': { logAuditEvent: async () => {} },
    '../services/anonymousAiBudget': { runAnonymousAi: createAnonymousAiBudget() },
    '../services/reasoningCapabilityService': { enabled: () => false },
  }, { importGemini: async () => ({ GoogleGenAI: class { constructor() { this.models = { generateContent: async options => { gemini.push(options); return { text: 'cloud' }; } }; } } }) });
  async function call(user, prompt = 'hello') {
    const res = new EventEmitter(); res.status = code => { res.statusCode = code; return res; }; res.json = data => { res.data = data; return res; };
    await controller.processIntelligencePrompt({ body: { prompt }, user }, res); return res;
  }
  assert.equal((await call()).statusCode, 200);
  assert.equal(gemini[0].config.maxOutputTokens, 512);
  assert.equal((await call(undefined, 'x'.repeat(4001))).statusCode, 413);
  assert.equal(gemini.length, 1);
  assert.equal((await call({ role: 'USER' }, 'x'.repeat(4001))).statusCode, 200);
  assert.equal(gemini[1].config, undefined);
  const commander = await call({ role: 'COMMANDER_IN_CHIEF' });
  assert.equal(commander.statusCode, 200); assert.equal(commander.data.rolePath, 'local_commander');
  assert.equal(ollama.length, 1); assert.equal(gemini.length, 2);
});
test('public route dedicated limiter rejects sixth request without limiting authenticated route', async () => {
  const express = require('express'); let calls = 0;
  const route = loadFixture('../routes/aiGatewayRoutes.js', {
    '../middleware/authMiddleware': { protect: (_req, _res, next) => next() },
    '../middleware/checkRole': { requireCommanderInChief: (_req, _res, next) => next() },
    '../controllers/aiGatewayController': { processIntelligencePrompt: (_req, res) => { calls++; res.json({ success: true }); } },
  });
  const app = express(); app.use('/api/ai', route);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(base + '/api/ai/public/intelligence', { method: 'POST' })).status, 200);
    const blocked = await fetch(base + '/api/ai/public/intelligence', { method: 'POST' });
    assert.equal(blocked.status, 429); assert.equal((await blocked.json()).success, false);
    assert.equal((await fetch(base + '/api/ai/intelligence', { method: 'POST' })).status, 200);
    assert.equal(calls, 6);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
