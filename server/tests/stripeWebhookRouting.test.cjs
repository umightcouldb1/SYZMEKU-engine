// Real HTTP/raw-body/signature handling with explicit in-memory persistence stubs.
// commerceRegression.test.cjs separately verifies real MongoDB idempotency.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const realStripe = require('stripe')('sk_test_fixture');

Object.assign(process.env, {
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
  FREEDOM_AUDIT_STRIPE_PRICE_ID: 'price_fixture',
});
const purchases = [];
let lineItemReads = 0, failPersistence = false, server, base;
require.cache[require.resolve('stripe')].exports = () => ({
  webhooks: realStripe.webhooks,
  checkout: { sessions: { listLineItems: async () => {
    lineItemReads += 1;
    return { data: [{ price: { id: 'price_fixture', product: { id: 'prod_fixture', name: 'The Freedom Audit' } }, amount_total: 3700, currency: 'usd' }] };
  } } },
});
const stub = (modulePath, exports) => {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('../models/UserProfile', { findOne: async () => ({ tier: 'public' }) });
stub('../services/freedomAuditPurchase', { recordPurchase: async (userId, purchase) => {
  if (failPersistence) throw new Error('Synthetic database outage');
  purchases.push({ userId, purchase });
} });
before(async () => {
  const app = express();
  app.use('/webhook', require('../routes/webhook'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
const session = { id: 'cs_async_fixture', client_reference_id: 'synthetic-buyer', mode: 'payment', status: 'complete', payment_status: 'unpaid' };
async function send(type, object = session, valid = true) {
  const body = JSON.stringify({ id: 'evt_fixture', type, data: { object } });
  const signature = valid ? realStripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET }) : 'invalid';
  return fetch(base + '/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body });
}
test('unpaid completion and async failure acknowledge without provider reads or fulfillment', async () => {
  const before = purchases.length, reads = lineItemReads;
  assert.equal((await send('checkout.session.completed')).status, 200);
  assert.equal((await send('checkout.session.async_payment_failed')).status, 200);
  assert.equal(purchases.length, before);
  assert.equal(lineItemReads, reads);
});
test('signed async and immediate success preserve owner, exact price and purchase amount', async () => {
  const before = purchases.length, paid = { ...session, payment_status: 'paid' };
  assert.equal((await send('checkout.session.async_payment_succeeded', paid, false)).status, 400);
  assert.equal(purchases.length, before);
  for (const type of ['checkout.session.async_payment_succeeded', 'checkout.session.completed']) {
    assert.equal((await send(type, paid)).status, 200);
    assert.equal(purchases.at(-1).userId, session.client_reference_id);
    assert.equal(purchases.at(-1).purchase.priceId, 'price_fixture');
    assert.equal(purchases.at(-1).purchase.amount, 37);
  }
  assert.equal(purchases.length, before + 2);
});
test('invalid async success and persistence failures remain retryable without granting access', async () => {
  const before = purchases.length;
  assert.equal((await send('checkout.session.async_payment_succeeded')).status, 500);
  assert.equal((await send('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid', client_reference_id: null })).status, 500);
  failPersistence = true;
  try { assert.equal((await send('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })).status, 500); }
  finally { failPersistence = false; }
  assert.equal(purchases.length, before);
});
