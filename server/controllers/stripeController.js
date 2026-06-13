const asyncHandler = require('express-async-handler');
const Stripe = require('stripe');

let stripeClient;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('STRIPE_SECRET_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!stripeClient) {
    stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

const getPublicBaseUrl = () => {
  const baseUrl = process.env.DOMAIN || process.env.CLIENT_ORIGIN;
  if (!baseUrl) {
    const error = new Error('DOMAIN or CLIENT_ORIGIN is required for Stripe Checkout redirects.');
    error.statusCode = 503;
    throw error;
  }

  return String(baseUrl).replace(/\/+$/, '');
};

const formatProduct = (product) => {
  const price = product.default_price && typeof product.default_price === 'object'
    ? product.default_price
    : null;

  return {
    id: product.id,
    priceId: price?.id || null,
    name: product.name,
    description: product.description || '',
    price: price?.unit_amount ? price.unit_amount / 100 : 0,
    currency: price?.currency || 'usd',
    interval: price?.recurring?.interval || null,
    metadata: product.metadata || {},
  };
};

const listProducts = asyncHandler(async (_req, res) => {
  const stripe = getStripe();
  const products = await stripe.products.list({
    active: true,
    limit: 100,
    expand: ['data.default_price'],
  });

  const formattedProducts = products.data
    .map(formatProduct)
    .filter((product) => product.priceId);

  return res.status(200).json(formattedProducts);
});

const createCheckoutSession = asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const { priceId } = req.body || {};

  if (!priceId || typeof priceId !== 'string') {
    return res.status(400).json({ error: 'A valid priceId is required.' });
  }

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product && typeof price.product === 'object' ? price.product : null;

  if (!price.active || (product && product.active === false)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const publicBaseUrl = getPublicBaseUrl();
  const mode = price.recurring ? 'subscription' : 'payment';
  const userId = req.user?._id ? String(req.user._id) : '';

  const session = await stripe.checkout.sessions.create({
    mode,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${publicBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicBaseUrl}/cancel`,
    client_reference_id: userId || undefined,
    customer_email: req.user?.email || undefined,
    metadata: {
      userId,
      productId: product?.id || '',
      productName: product?.name || '',
      source: 'syzmeku_public_catalog',
    },
  });

  return res.status(200).json({ url: session.url });
});

module.exports = {
  listProducts,
  createCheckoutSession,
};
