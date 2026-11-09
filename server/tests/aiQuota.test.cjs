const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const quota = require('../services/aiQuotaService');
const { runWithRequestContext, getRequestContext } = require('../utils/requestContext');
const originalReserve = quota.reserveAiUsage, originalFetch = global.fetch;
const originalEnv = { ...process.env };
afterEach(() => { quota.reserveAiUsage = originalReserve; global.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv); });
function fixture(store = new Map(), options = {}) {
  return quota.createAiQuotaService({ getContext: () => options.context || {},
    findUser: async () => ({ role: options.role || 'USER' }),
    hasPaidPurchase: async () => !!options.paid,
    increment: async (id, limit) => {
      if (options.unavailable) throw Error('private DB details');
      const count = store.get(id) || 0;
      if (count >= limit) return false;
      store.set(id, count + 1); return true;
    }, now: () => options.time || Date.UTC(2026, 0, 1) });
}
const authenticated = { authenticated: true, userId: '111111111111111111111111', sessionId: 'fixture' };
test('anonymous and newly registered users share durable admission across service instances', async () => {
  const store = new Map();
  const replicas = [fixture(store), fixture(store, { context: authenticated })];
  const outcomes = await Promise.allSettled(Array.from({ length: 150 }, (_, i) => replicas[i % 2]()));
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 100);
  assert.equal(outcomes.filter(x => x.status === 'rejected' && x.reason.statusCode === 429).length, 50);
  await assert.rejects(fixture(store), { statusCode: 429 }); // new process/service state, same storage
  assert.equal((await fixture(store, { time: Date.UTC(2026, 0, 2) })()).limited, true);
});
test('only DB role or paid matching product context exempts usage; no arbitrary purchase exemption', async () => {
  const store = new Map([['free-gemini:2026-01-01', 100]]);
  assert.equal((await fixture(store, { context: authenticated, role: 'COMMANDER_IN_CHIEF' })()).entitlement, 'operator');
  assert.equal((await fixture(store, { context: { ...authenticated, aiProduct: 'freedom-audit' }, paid: true })()).entitlement, 'paid');
  for (const opts of [{ context: authenticated, paid: true }, { context: { ...authenticated, aiProduct: 'freedom-audit' }, paid: false }, { context: { role: 'COMMANDER_IN_CHIEF', aiProduct: 'freedom-audit' }, paid: true }]) {
    await assert.rejects(fixture(store, opts), { statusCode: 429 });
  }
});
test('storage and malformed trusted context fail closed with sanitized errors', async () => {
  await assert.rejects(fixture(new Map(), { unavailable: true }), error => error.statusCode === 503 && !error.message.includes('private'));
  await assert.rejects(fixture(new Map(), { context: { authenticated: true, userId: 'bad' } }), { statusCode: 503 });
});
test('paid product marker is scoped to callback and preserves authenticated identity', async () => {
  await runWithRequestContext(authenticated, async () => {
    await quota.withFreedomAuditQuotaContext(async () => { assert.equal(getRequestContext().aiProduct, 'freedom-audit'); assert.equal(getRequestContext().userId, authenticated.userId); });
    assert.equal(getRequestContext().aiProduct, undefined);
  });
});
test('provider boundaries reject quota failure before all Gemini transport calls; local provider unaffected', async () => {
  process.env.GEMINI_API_KEY = 'synthetic'; delete process.env.Gemini_API_Key; delete process.env.Gemini_API_KEY;
  let calls = 0; global.fetch = async () => { calls++; return Response.json({ response: '{}' }); };
  quota.reserveAiUsage = async () => { throw Object.assign(Error('unavailable'), { statusCode: 503 }); };
  await assert.rejects(() => require('../services/modelRouter').requestModelJson({ prompt: 'fixture' }), { statusCode: 503 });
  await assert.rejects(() => require('../services/reasoningProviderService').generate({ prompt: 'fixture' }), { statusCode: 503 });
  assert.equal(calls, 0);
  await require('../services/reasoningProviderService').generate({ prompt: 'fixture', provider: 'ollama' });
  assert.equal(calls, 1);
});
test('free legacy and structured calls enforce payload bounds, output cap and deadline signals', async () => {
  process.env.GEMINI_API_KEY = 'synthetic'; delete process.env.Gemini_API_Key; delete process.env.Gemini_API_KEY;
  quota.reserveAiUsage = async () => ({ limited: true });
  const options = [];
  global.fetch = async (_, config) => { options.push(config); return Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }); };
  await require('../services/modelRouter').requestModelJson({ prompt: 'fixture' });
  await require('../services/reasoningProviderService').generate({ prompt: 'fixture', maxOutputTokens: 6144 });
  for (const config of options) { assert(config.signal instanceof AbortSignal); assert.equal(JSON.parse(config.body).generationConfig.maxOutputTokens, 4096); }
  await assert.rejects(() => require('../services/modelRouter').requestModelJson({ prompt: 'x'.repeat(262145) }), { statusCode: 413 });
  await assert.rejects(() => require('../services/reasoningProviderService').generate({ prompt: 'x'.repeat(262145) }), { statusCode: 413 });
  assert.equal(options.length, 2);
});
test('Mongo admission uses conditional atomic upsert, unique _id and majority acknowledgement', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  let request, exhausted = false;
  const mock = { updateOne: async (...args) => { request = args; if (exhausted) throw Object.assign(Error('duplicate'), { code: 11000 }); return { upsertedCount: 1 }; } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/aiQuotaService'), 'utf8'), { module, Date, Buffer,
    require: id => { if (id === '../models/AiQuotaBucket') return mock; if (id === '../utils/requestContext') return { getRequestContext: () => ({}) }; throw Error(id); } });
  await module.exports.reserveAiUsage();
  assert.equal(request[0].attempts.$lt, 100); assert.equal(request[1].$inc.attempts, 1); assert.equal(request[2].upsert, true); assert.equal(request[2].writeConcern.w, 'majority');
  exhausted = true; await assert.rejects(() => module.exports.reserveAiUsage(), { statusCode: 429 });
});

test('paid Freedom Audit retains its 30/hour allowance durably across restarts and replicas',async()=>{
 const store=new Map(),options={context:{...authenticated,aiProduct:'freedom-audit'},paid:true};
 const results=await Promise.allSettled(Array.from({length:40},()=>fixture(store,options)()));assert.equal(results.filter(x=>x.status==='fulfilled').length,30);assert(results.filter(x=>x.status==='rejected').every(x=>x.reason.code==='AI_PAID_QUOTA_EXHAUSTED'));
 await assert.rejects(fixture(store,options),{statusCode:429});assert.equal((await fixture(store,{...options,time:Date.UTC(2026,0,1,1)})()).entitlement,'paid');
 assert.equal((await fixture(store,{...options,context:{...options.context,userId:'222222222222222222222222'}})()).entitlement,'paid');
});
