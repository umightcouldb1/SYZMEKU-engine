const express = require('express');
const Stripe = require('stripe');

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

const { synchronizeEvent } = require('../services/stripeEntitlements');

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
    await synchronizeEvent(getStripe(), event);

    return res.json({ received: true });
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_ERR]', error?.message || error);
    return res.status(500).json({ error: 'Webhook fulfillment failed.' });
  }
};

router.post('/', express.raw({ type: 'application/json' }), handleStripeWebhook);
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
