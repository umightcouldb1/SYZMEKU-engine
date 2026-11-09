const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GenesisPatron, GENESIS_SEAT_LIMIT } = require('../models/GenesisPatron');
const router = require('../routes/billingRoutes');
const route = (path) => router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
const invoke = async (path, body = {}, headers = {}) => {
  const result = { statusCode: 200 };
  const res = { status(code) { result.statusCode = code; return this; }, json(data) { result.body = data; return this; } };
  await route(path)({ body, headers }, res);
  return result;
};

test('anonymous Genesis readiness never queries or exposes an individual purchase', async (t) => {
  t.mock.method(GenesisPatron, 'countDocuments', async () => 7);
  const lookup = t.mock.method(GenesisPatron, 'findOne', () => { throw new Error('Anonymous patron lookup is forbidden'); });
  const known = await invoke('/genesis-lock', { email: 'paid@example.test' });
  const unknown = await invoke('/genesis-lock', { email: 'unpaid@example.test' });
  assert.deepEqual(known, unknown);
  assert.equal(known.statusCode, 402);
  assert.equal(lookup.mock.callCount(), 0);
  for (const key of ['paymentReference', 'seatAllocation', 'status', 'duplicate']) assert(!(key in known.body));
});

test('closed Genesis readiness remains aggregate-only and does not consult a supplied identifier', async (t) => {
  t.mock.method(GenesisPatron, 'countDocuments', async () => GENESIS_SEAT_LIMIT);
  const lookup = t.mock.method(GenesisPatron, 'findOne', () => { throw new Error('Anonymous patron lookup is forbidden'); });
  const a = await invoke('/genesis-lock', { identifier: 'paid@example.test' });
  const b = await invoke('/genesis-lock', { identifier: 'other@example.test' });
  assert.deepEqual(a, b); assert.equal(a.statusCode, 403); assert.equal(lookup.mock.callCount(), 0);
});

test('payment confirmation still requires its secret before reading a patron', async (t) => {
  const oldSecret = process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET;
  const lookup = t.mock.method(GenesisPatron, 'findOne', () => ({ lean: async () => ({ tier: 'Genesis_Lifetime', status: 'paid', seatNumber: 4, payment: { reference: 'paid-fixture' } }) }));
  try {
    delete process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET;
    assert.equal((await invoke('/genesis-payment-confirmed')).statusCode, 503);
    process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET = 'test-confirmation-secret';
    assert.equal((await invoke('/genesis-payment-confirmed')).statusCode, 401);
    assert.equal(lookup.mock.callCount(), 0);
    const paid = await invoke('/genesis-payment-confirmed', { email: 'paid@example.test', paymentReference: 'paid-fixture' }, { 'x-genesis-payment-secret': 'test-confirmation-secret' });
    assert.equal(paid.statusCode, 200); assert.equal(paid.body.paymentReference, 'paid-fixture');
    assert.equal(paid.body.duplicate, true);
  } finally {
    if (oldSecret === undefined) delete process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET;
    else process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET = oldSecret;
  }
});
