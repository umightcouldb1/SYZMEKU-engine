const { test } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { synchronizeCheckout, synchronizeEvent, ownerOf, paymentFacts } = require('../services/stripeEntitlements');
const owner = '507f1f77bcf86cd799439011', other = '507f1f77bcf86cd799439012';
const copy = value => structuredClone(value);
function fixture(t) {
  process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID = 'price_audit';
  let profile = { _id: 'profile', userId: owner, tier: 'public', purchasedProducts: [], preferences: { motionEnabled: false }, freedomAudit: { latestResult: { id: 'keep-result' } } };
  let session = { id: 'cs_fixture', payment_intent: 'pi_fixture', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: owner, created: 100 };
  let charge = { id: 'ch_fixture', payment_intent: 'pi_fixture', paid: true, amount: 3700, amount_refunded: 0, disputed: false };
  let intent = { id: 'pi_fixture', status: 'succeeded', latest_charge: 'ch_fixture' };
  let dispute = { id: 'dp_fixture', charge: 'ch_fixture', status: 'needs_response' };
  let lineReads = 0, snapshotReads = 0, conflict;
  let lines = [{ id: 'li_1', price: { id: 'price_audit', product: { id: 'prod_audit', name: 'Freedom Audit' } }, amount_total: 3700, currency: 'usd' }];
  t.mock.method(User, 'exists', async () => ({ _id: owner }));
  t.mock.method(UserProfile, 'exists', async () => null);
  t.mock.method(UserProfile, 'findOne', () => ({ lean: async () => { snapshotReads++; return copy(profile); } }));
  t.mock.method(UserProfile, 'findOneAndUpdate', async (filter, update) => {
    if (update.$setOnInsert) return copy(profile);
    if (conflict) { const action = conflict; conflict = null; action(); return null; }
    if (JSON.stringify(filter.$expr.$eq[1].$literal) !== JSON.stringify(profile.purchasedProducts)) return null;
    profile = { ...profile, ...copy(update.$set) }; return copy(profile);
  });
  const stripe = {
    paymentIntents: { retrieve: async () => copy(intent) },
    charges: { retrieve: async () => copy(charge) },
    disputes: { retrieve: async () => copy(dispute), list: async () => ({ data: [copy(dispute)] }) },
    checkout: { sessions: {
      retrieve: async () => copy(session), list: async () => ({ data: [copy(session)] }),
      listLineItems: async (_id, params) => { lineReads++; return params.starting_after ? { data: lines.slice(1) } : { data: lines.slice(0, 1), has_more: lines.length > 1 }; },
    } },
  };
  return { stripe, get profile() { return profile; }, session, charge, intent, dispute, lines,
    conflict: fn => { conflict = fn; }, get reads() { return { lineReads, snapshotReads }; } };
}
test('repeated and concurrent fulfillment grant one purchase, retain ownership/history/preferences', async t => {
  const f = fixture(t);
  await Promise.all(Array.from({ length: 6 }, () => synchronizeCheckout(f.stripe, 'cs_fixture')));
  assert.equal(f.profile.purchasedProducts.length, 1);
  assert.equal(f.profile.purchasedProducts[0].status, 'paid');
  assert.equal(f.profile.userId, owner);
  assert.deepEqual(f.profile.preferences, { motionEnabled: false });
  assert.deepEqual(f.profile.freedomAudit.latestResult, { id: 'keep-result' });
  assert.equal(f.profile.purchasedProducts[0].purchasedAt.getTime(), 100000);
});
test('verification and generic webhook replay never restore manual refunds/cancellations', async t => {
  const f = fixture(t);
  await synchronizeCheckout(f.stripe, 'cs_fixture');
  for (const status of ['refunded', 'canceled']) {
    f.profile.purchasedProducts[0].status = status;
    await synchronizeEvent(f.stripe, { type: 'checkout.session.completed', data: { object: { id: 'cs_fixture', payment_status: 'paid' } } });
    assert.equal(f.profile.purchasedProducts[0].status, status);
    await synchronizeCheckout(f.stripe, 'cs_fixture', { expectedUserId: owner, requiredPriceId: 'price_audit' });
    assert.equal(f.profile.purchasedProducts[0].status, status);
  }
});
test('async completion unpaid and failure do not grant; success and out-of-order failure read current state', async t => {
  const f = fixture(t);
  f.session.payment_status = 'unpaid'; f.intent.status = 'processing'; f.intent.latest_charge = null;
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_failed']) {
    await synchronizeEvent(f.stripe, { type, data: { object: f.session } });
    assert.equal(f.profile.purchasedProducts[0].status, 'pending');
  }
  f.session.payment_status = 'paid'; f.intent.status = 'succeeded'; f.intent.latest_charge = 'ch_fixture';
  await synchronizeEvent(f.stripe, { type: 'checkout.session.async_payment_succeeded', data: { object: f.session } });
  assert.equal(f.profile.purchasedProducts[0].status, 'paid');
  await synchronizeEvent(f.stripe, { type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_fixture', payment_status: 'unpaid' } } });
  assert.equal(f.profile.purchasedProducts[0].status, 'paid');
});
test('partial refund records session-level facts and retains paid access', async t => {
  const f = fixture(t); f.charge.amount_refunded = 1200;
  await synchronizeEvent(f.stripe, { type: 'charge.refunded', data: { object: f.charge } });
  assert.equal(f.profile.purchasedProducts[0].amountRefunded, 1200);
  assert.equal(f.profile.purchasedProducts[0].fullyRefunded, false);
  assert.equal(f.profile.purchasedProducts[0].status, 'paid');
});
test('CAS conflict forces fresh Stripe read and preserves another purchase', async t => {
  const f = fixture(t);
  f.conflict(() => { f.charge.amount_refunded = 900; f.profile.purchasedProducts.push({ checkoutSessionId: 'cs_other', priceId: 'price_other', tier: 'guardian', status: 'paid' }); });
  await synchronizeCheckout(f.stripe, 'cs_fixture');
  assert.equal(f.profile.purchasedProducts.length, 2);
  assert.equal(f.profile.purchasedProducts.find(p => p.checkoutSessionId === 'cs_fixture').amountRefunded, 900);
  assert.equal(f.profile.tier, 'guardian'); assert.equal(f.reads.snapshotReads, 2);
});
test('product pagination is complete and duplicate same-price items stay idempotent', async t => {
  const f = fixture(t); f.lines.push({ ...copy(f.lines[0]), id: 'li_2', price: { id: 'price_cosmic', product: { id: 'prod_cosmic', name: 'Cosmic' } } });
  await synchronizeCheckout(f.stripe, 'cs_fixture');
  assert.equal(f.profile.purchasedProducts.length, 2); assert.equal(f.profile.tier, 'cosmic'); assert.equal(f.reads.lineReads, 2);
});
test('wrong owner, conflicting metadata, missing user and cross-account records fail closed', async t => {
  const f = fixture(t);
  await assert.rejects(synchronizeCheckout(f.stripe, 'cs_fixture', { expectedUserId: other }), /does not belong/);
  assert.throws(() => ownerOf({ client_reference_id: owner, metadata: { userId: other } }), /conflicting/);
  t.mock.method(UserProfile, 'exists', async () => ({ _id: 'foreign' }));
  await assert.rejects(synchronizeCheckout(f.stripe, 'cs_fixture'), /another account/);
  t.mock.method(User, 'exists', async () => null);
  await assert.rejects(synchronizeCheckout(f.stripe, 'cs_fixture'), /does not exist/);
  assert.equal(f.profile.purchasedProducts.length, 0);
});
test('provider outage and unverified payment fail without access mutation', async t => {
  const f = fixture(t);
  f.stripe.paymentIntents.retrieve = async () => { throw new Error('temporary outage'); };
  await assert.rejects(synchronizeCheckout(f.stripe, 'cs_fixture'), /temporary outage/);
  assert.equal(f.profile.purchasedProducts.length, 0);
  f.session.payment_intent = null;
  await assert.rejects(paymentFacts(f.stripe, f.session), /no PaymentIntent/);
});
test('dispute events resolve current charge and dispute, not stale webhook status', async t => {
  const f = fixture(t); f.charge.disputed = true; f.dispute.status = 'won';
  await synchronizeEvent(f.stripe, { type: 'charge.dispute.created', data: { object: { charge: 'ch_fixture', status: 'needs_response' } } });
  assert.equal(f.profile.purchasedProducts[0].disputeStatus, 'won');
  assert.equal(f.profile.purchasedProducts[0].status, 'paid');
});
test('historical reconciliation dry-run never creates profiles or writes purchase state', async t => {
  const f=fixture(t),before=copy(f.profile);f.charge.amount_refunded=3700;
  const result=await synchronizeCheckout(f.stripe,'cs_fixture',{expectedUserId:owner,dryRun:true});
  assert.equal(result.fullyRefunded,true);assert.equal(result.changed,true);
  assert.equal(UserProfile.findOneAndUpdate.mock.callCount(),0);assert.deepEqual(f.profile,before);
});

test('an old paid marker cannot override currently unverified or failed payment state',async t=>{
 const f=fixture(t);await synchronizeCheckout(f.stripe,'cs_fixture');assert.equal(f.profile.purchasedProducts[0].status,'paid');f.session.payment_status='unpaid';f.intent.status='requires_payment_method';f.intent.latest_charge=null;await synchronizeEvent(f.stripe,{type:'checkout.session.async_payment_failed',data:{object:{id:'cs_fixture'}}});assert.equal(f.profile.purchasedProducts[0].status,'pending');
});
