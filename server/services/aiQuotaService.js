const FREE_DAILY_ATTEMPTS = 100;
const PAID_FREEDOM_HOURLY_ATTEMPTS = 30;
const quotaError = (code, message, statusCode) => Object.assign(new Error(message), { code, statusCode, status: statusCode, reasoningError: true });

// A shared request quota, NOT a monetary spending cap. All anonymous and unpaid
// users share one pool, so creating accounts or adding replicas cannot multiply it.
// Paid purchases and commander access retain their existing product permissions.
function createAiQuotaService({ getContext, findUser, hasPaidPurchase, increment, now = Date.now }) {
  return async function reserve() {
    try {
      const context = getContext();
      if (context.authenticated === true) {
        if (!/^[a-f\d]{24}$/i.test(String(context.userId || '')) || !context.sessionId) {
          throw quotaError('AI_QUOTA_UNAVAILABLE', 'AI usage verification is unavailable.', 503);
        }
        const user = await findUser(String(context.userId));
        if (!user) throw quotaError('AI_QUOTA_UNAVAILABLE', 'AI usage verification is unavailable.', 503);
        if (user.role === 'COMMANDER_IN_CHIEF') return { limited: false, entitlement: 'operator' };
        if (context.aiProduct === 'freedom-audit' && await hasPaidPurchase(String(context.userId))) {
          const hour = new Date(now()).toISOString().slice(0, 13);
          if (!await increment(`paid-freedom:${context.userId}:${hour}`, PAID_FREEDOM_HOURLY_ATTEMPTS)) {
            throw quotaError('AI_PAID_QUOTA_EXHAUSTED', 'Freedom Audit generation limit reached. Please try again in an hour.', 429);
          }
          return { limited: false, entitlement: 'paid' };
        }
      }
      const day = new Date(now()).toISOString().slice(0, 10);
      const admitted = await increment(`free-gemini:${day}`, FREE_DAILY_ATTEMPTS);
      if (!admitted) throw quotaError('AI_FREE_QUOTA_EXHAUSTED', 'Free AI usage is temporarily unavailable. Please try again tomorrow.', 429);
      return { limited: true, entitlement: 'free' };
    } catch (error) {
      if (['AI_FREE_QUOTA_EXHAUSTED', 'AI_PAID_QUOTA_EXHAUSTED', 'AI_QUOTA_UNAVAILABLE'].includes(error.code)) throw error;
      throw quotaError('AI_QUOTA_UNAVAILABLE', 'AI usage verification is unavailable. Please try again later.', 503);
    }
  };
}
async function increment(id, limit) {
  const Bucket = require('../models/AiQuotaBucket');
  // Existing exhausted buckets cannot match this predicate. An attempted upsert
  // then conflicts with _id uniqueness, including across concurrent replicas.
  try {
    const result = await Bucket.updateOne({ _id: id, attempts: { $lt: limit } },
      { $inc: { attempts: 1 } }, { upsert: true, writeConcern: { w: 'majority' } });
    return result.modifiedCount === 1 || result.upsertedCount === 1;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}
const reserveAiUsage = createAiQuotaService({
  getContext: () => require('../utils/requestContext').getRequestContext(),
  findUser: id => require('../models/User').findById(id).select('role').lean(),
  hasPaidPurchase: userId => Boolean(process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID) && require('../models/UserProfile').exists({ userId,
    purchasedProducts: { $elemMatch: { status: 'paid', priceId: process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID } } }),
  increment,
});
// Called only by the server-owned paid product generator, never from req.body.
const withFreedomAuditQuotaContext = callback => {
  const { getRequestContext, runWithRequestContext } = require('../utils/requestContext');
  return runWithRequestContext({ ...getRequestContext(), aiProduct: 'freedom-audit' }, callback);
};
const boundFreeRequest = (quota, payload) => {
  if (quota.limited && Buffer.byteLength(JSON.stringify(payload), 'utf8') > 262144) {
    throw quotaError('AI_INPUT_TOO_LARGE', 'AI request exceeds the free usage limit.', 413);
  }
};
module.exports = { FREE_DAILY_ATTEMPTS, PAID_FREEDOM_HOURLY_ATTEMPTS, createAiQuotaService, reserveAiUsage, withFreedomAuditQuotaContext, boundFreeRequest };
