const express = require('express');
const Stripe = require('stripe');
const UserProfile = require('../models/UserProfile');

const router = express.Router();

let stripeClient;

const getStripeSecretKey = () => process.env.STRIPE_SECRET_KEY || process.env.Stripe_Secret_Key;
const getStripeWebhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || process.env.Stripe_Webhook_Secret;

const getStripe = () => {
  if (!getStripeSecretKey()) {
    const error = new Error('STRIPE_SECRET_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!stripeClient) {
    stripeClient = Stripe(getStripeSecretKey());
  }

  return stripeClient;
};

const deriveTier = (name = '', metadataTier = '') => {
  const source = `${metadataTier} ${name}`.toLowerCase();
  if (source.includes('genesis')) return 'genesis';
  if (source.includes('guardian')) return 'guardian';
  if (source.includes('cosmic')) return 'cosmic';
  if (source.includes('harmonic')) return 'harmonic';
  if (source.includes('ketsuron')) return 'ketsuron';
  return 'active';
};

const rankTier = (tier = 'public') => {
  const ranks = {
    public: 0,
    active: 1,
    ketsuron: 2,
    harmonic: 3,
    cosmic: 4,
    guardian: 5,
    genesis: 6,
  };
  return ranks[tier] ?? ranks.public;
};

const highestTier = (currentTier, purchasedProducts = []) => {
  return purchasedProducts.reduce((best, product) => {
    const tier = product.status === 'paid' ? product.tier : 'public';
    return rankTier(tier) > rankTier(best) ? tier : best;
  }, currentTier || 'public');
};

const normalizeLineItem = (session, lineItem) => {
  const price = lineItem.price || {};
  const product = price.product && typeof price.product === 'object' ? price.product : null;
  const productName = product?.name || lineItem.description || session.metadata?.productName || '';
  const tier = deriveTier(productName, product?.metadata?.tier || session.metadata?.tier);

  return {
    productId: product?.id || session.metadata?.productId || '',
    priceId: price.id || session.metadata?.priceId || '',
    name: productName,
    tier,
    amount: Number(lineItem.amount_total ?? session.amount_total ?? 0) / 100,
    currency: lineItem.currency || session.currency || 'usd',
    checkoutSessionId: session.id,
    purchasedAt: new Date(),
    status: 'paid',
  };
};

const fulfillCheckoutSession = async (session) => {
  const userId = session.client_reference_id || session.metadata?.userId || session.metadata?.user_id;
  if (!userId) {
    throw new Error(`Checkout session ${session.id} is missing user identity metadata.`);
  }

  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });

  const purchases = lineItems.data.map((lineItem) => normalizeLineItem(session, lineItem));
  if (purchases.length === 0) {
    throw new Error(`Checkout session ${session.id} has no line items.`);
  }

  let profile = await UserProfile.findOne({ userId });
  if (!profile) {
    profile = await UserProfile.create({ userId });
  }

  for (const purchase of purchases) {
    const existingIndex = profile.purchasedProducts.findIndex(
      (product) => product.checkoutSessionId === session.id && product.priceId === purchase.priceId
    );

    if (existingIndex >= 0) {
      profile.purchasedProducts[existingIndex] = purchase;
    } else {
      profile.purchasedProducts.push(purchase);
    }
  }

  profile.tier = highestTier(profile.tier, profile.purchasedProducts);
  await profile.save();

  return { userId, purchases: purchases.length, tier: profile.tier };
};

const handleStripeWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    return res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await fulfillCheckoutSession(event.data.object);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_ERR]', error?.message || error);
    return res.status(500).json({ error: 'Webhook fulfillment failed.' });
  }
};

router.post('/', express.raw({ type: 'application/json' }), handleStripeWebhook);
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
