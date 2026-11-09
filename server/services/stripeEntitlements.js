const mongoose = require('mongoose');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { ensureProfile } = require('./freedomAuditPurchase');

const idOf = value => typeof value === 'string' ? value : value?.id;
const ranks = { public: 0, active: 1, ketsuron: 2, harmonic: 3, cosmic: 4, guardian: 5, genesis: 6 };
function deriveTier(name = '', metadataTier = '', priceId = '') {
  if (process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID && priceId === process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID) return 'freedom_audit';
  const source = `${metadataTier} ${name}`.toLowerCase();
  return ['genesis', 'guardian', 'cosmic', 'harmonic', 'ketsuron'].find(tier => source.includes(tier)) || 'active';
}
function highestTier(purchases) {
  return purchases.reduce((best, p) => p.status === 'paid' && (ranks[p.tier] || 0) > (ranks[best] || 0) ? p.tier : best, 'public');
}
function ownerOf(session) {
  const values = [session.client_reference_id, session.metadata?.userId, session.metadata?.user_id].filter(Boolean).map(String);
  if (!values.length || values.some(value => value !== values[0]) || !mongoose.isValidObjectId(values[0])) throw new Error('Checkout has missing or conflicting account identity.');
  return values[0];
}
async function listAll(list, params) {
  const items = [];
  let starting_after;
  do {
    const page = await list({ ...params, limit: 100, ...(starting_after ? { starting_after } : {}) });
    items.push(...page.data);
    if (!page.has_more) return items;
    const next = page.data.at(-1)?.id;
    if (!next || next === starting_after) throw new Error('Stripe pagination did not advance.');
    starting_after = next;
  } while (true);
}
async function paymentFacts(stripe, session) {
  const paymentIntentId = idOf(session.payment_intent);
  if (!paymentIntentId) {
    if (session.payment_status === 'paid') throw new Error('Paid session has no PaymentIntent.');
    return { paymentIntentId: '', chargeId: '', paymentStatus: 'pending', amountRefunded: 0, fullyRefunded: false, disputeStatus: '', settled: false };
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId = idOf(intent.latest_charge);
  const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
  if (charge && idOf(charge.payment_intent) !== paymentIntentId) throw new Error('Charge does not belong to payment.');
  const disputeId = idOf(charge?.dispute);
  // Charge.disputed remains true for some resolved disputes. Fetch the actual dispute.
  const disputes = charge?.disputed && !disputeId
    ? await listAll(params => stripe.disputes.list(params), { payment_intent: paymentIntentId }) : [];
  const dispute = disputeId ? await stripe.disputes.retrieve(disputeId) : disputes.find(d => idOf(d.charge) === chargeId);
  if (charge?.disputed && !dispute) throw new Error('Disputed charge has no verifiable dispute.');
  if (dispute && idOf(dispute.charge) !== chargeId) throw new Error('Dispute does not belong to charge.');
  return {
    paymentIntentId, chargeId: chargeId || '', paymentStatus: intent.status,
    amountRefunded: charge?.amount_refunded || 0,
    fullyRefunded: Boolean(charge && (charge.refunded || (charge.amount > 0 && charge.amount_refunded >= charge.amount))),
    disputeStatus: dispute?.status || '',
    settled: session.mode === 'payment' && session.status === 'complete' && session.payment_status === 'paid' && intent.status === 'succeeded' && charge?.paid === true,
  };
}
function purchaseStatus(previous, facts) {
  // Financial policy is deliberately kept separate from processor facts. Existing
  // manual revocations must never be undone by checkout verification or replay.
  if (previous && ['refunded', 'canceled'].includes(previous.status)) return previous.status;
  return facts.settled ? 'paid' : 'pending';
}
async function synchronizeCheckout(stripe, sessionId, { expectedUserId, requiredPriceId, dryRun = false } = {}) {
  const initial = await stripe.checkout.sessions.retrieve(sessionId);
  if (initial.mode !== 'payment') return null;
  const userId = ownerOf(initial);
  if (expectedUserId && userId !== String(expectedUserId)) throw Object.assign(new Error('Checkout does not belong to this account.'), { statusCode: 403 });
  if (!await User.exists({ _id: userId })) throw new Error('Checkout account does not exist.');
  if (await UserProfile.exists({ userId: { $ne: userId }, 'purchasedProducts.checkoutSessionId': sessionId })) throw new Error('Checkout already belongs to another account.');
  if (!dryRun) await ensureProfile(userId);
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await UserProfile.findOne({ userId }).lean();
    if (!before) throw new Error('Checkout account has no existing profile.');
    // Read provider state AFTER the local snapshot. A concurrent synchronization
    // changes the array, forcing a new Stripe read instead of writing stale state.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (ownerOf(session) !== userId || session.mode !== 'payment') throw new Error('Checkout identity or mode changed.');
    const facts = await paymentFacts(stripe, session);
    const lines = await listAll(params => stripe.checkout.sessions.listLineItems(sessionId, params), { expand: ['data.price.product'] });
    if (!lines.length) throw new Error('Checkout has no line items.');
    if (requiredPriceId && !lines.some(line => line.price?.id === requiredPriceId)) return null;
    const purchases = before.purchasedProducts.map(p => ({ ...p }));
    // A price can occur on several lines; access is per checkout/price while the
    // recorded amount is the sum, not whichever line happened to arrive last.
    const grouped = new Map();
    for (const line of lines) {
      const key = line.price?.id;
      if (grouped.has(key)) grouped.get(key).amount_total += Number(line.amount_total || 0);
      else grouped.set(key, { ...line, amount_total: Number(line.amount_total || 0) });
    }
    for (const line of grouped.values()) {
      const price = line.price || {};
      const product = typeof price.product === 'object' ? price.product : {};
      if (!price.id || !(product?.id || idOf(price.product))) throw new Error('Checkout line item has no product/price identity.');
      const index = purchases.findIndex(p => p.checkoutSessionId === sessionId && p.priceId === price.id);
      const previous = index < 0 ? null : purchases[index];
      const name = product?.name || line.description || '';
      const purchase = { ...previous,
        productId: previous?.productId || product?.id || idOf(price.product), priceId: price.id, name: previous?.name || name,
        tier: previous?.tier || deriveTier(name, product?.metadata?.tier, price.id), amount: Number(line.amount_total || 0) / 100,
        currency: line.currency || session.currency, checkoutSessionId: sessionId,
        purchasedAt: previous?.purchasedAt || new Date((session.created || Math.floor(Date.now() / 1000)) * 1000),
        status: purchaseStatus(previous, facts),
        paymentIntentId: facts.paymentIntentId, chargeId: facts.chargeId,
        paymentStatus: facts.paymentStatus, amountRefunded: facts.amountRefunded,
        fullyRefunded: facts.fullyRefunded, disputeStatus: facts.disputeStatus,
      };
      if (index < 0) purchases.push(purchase); else purchases[index] = purchase;
    }
    // Preserve independently assigned legacy tiers; only recompute tiers whose
    // provenance can be traced to the prior paid purchases.
    const oldPaidTier = highestTier(before.purchasedProducts);
    const tier = before.tier === oldPaidTier || before.tier === 'public' ? highestTier(purchases) : before.tier;
    if (dryRun) return { changed: JSON.stringify(purchases) !== JSON.stringify(before.purchasedProducts) || tier !== before.tier,
      beforeStatuses: before.purchasedProducts.filter(p => p.checkoutSessionId === sessionId).map(p => p.status),
      afterStatuses: purchases.filter(p => p.checkoutSessionId === sessionId).map(p => p.status),
      fullyRefunded: facts.fullyRefunded, disputeStatus: facts.disputeStatus };
    const updated = await UserProfile.findOneAndUpdate({ _id: before._id,
      $expr: { $eq: ['$purchasedProducts', { $literal: before.purchasedProducts }] }, tier: before.tier,
    }, { $set: { purchasedProducts: purchases, tier }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (updated) return updated;
  }
  throw new Error('Concurrent checkout updates; retry delivery.');
}
const checkoutEvents = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']);
const chargeEvents = new Set(['charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_reinstated', 'charge.dispute.funds_withdrawn']);
const refundEvents = new Set(['refund.created', 'refund.updated', 'refund.failed']);
async function synchronizeEvent(stripe, event) {
  const object = event.data.object;
  if (checkoutEvents.has(event.type)) return synchronizeCheckout(stripe, object.id);
  if (!chargeEvents.has(event.type) && !refundEvents.has(event.type)) return;
  let paymentIntentId = idOf(object.payment_intent);
  if (!paymentIntentId) {
    const chargeId = event.type === 'charge.refunded' ? object.id : idOf(object.charge);
    if (!chargeId) throw new Error('Financial event has no payment reference.');
    paymentIntentId = idOf((await stripe.charges.retrieve(chargeId)).payment_intent);
  }
  if (!paymentIntentId) return; // Not a Checkout PaymentIntent (e.g. legacy direct charge).
  const sessions = await listAll(params => stripe.checkout.sessions.list(params), { payment_intent: paymentIntentId });
  for (const session of sessions) if (session.mode === 'payment') await synchronizeCheckout(stripe, session.id);
}
module.exports = { synchronizeCheckout, synchronizeEvent, purchaseStatus, paymentFacts, highestTier, ownerOf };
