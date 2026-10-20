const asyncHandler = require('express-async-handler');
const Stripe = require('stripe');
const UserProfile = require('../models/UserProfile');
const { randomUUID } = require('node:crypto');
const { generatePersonalizedPlan } = require('../services/freedomAuditPlan');
const { ensureProfile, recordPurchase } = require('../services/freedomAuditPurchase');

const FREEDOM_AUDIT_PRODUCT_SLUG = 'freedom-audit';
const FREEDOM_AUDIT_TIER = 'freedom_audit';
const DOMAIN_KEYS = ['time', 'money', 'obligations', 'assets', 'desires'];
const MAX_RESULT_HISTORY = 10;
const MAX_TEXT_LENGTH = 1000;

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

const getAppUrl = () => {
  const appUrl = process.env.FREEDOM_AUDIT_APP_URL || process.env.DOMAIN || process.env.CLIENT_ORIGIN;
  if (!appUrl) {
    const error = new Error('FREEDOM_AUDIT_APP_URL, DOMAIN, or CLIENT_ORIGIN is required.');
    error.statusCode = 503;
    throw error;
  }

  return String(appUrl).split(',')[0].replace(/\/+$/, '');
};

const getFreedomAuditPriceId = () => {
  const priceId = process.env.FREEDOM_AUDIT_STRIPE_PRICE_ID;
  if (!priceId) {
    const error = new Error('FREEDOM_AUDIT_STRIPE_PRICE_ID is not configured.');
    error.statusCode = 503;
    throw error;
  }

  return priceId;
};

const assertFreedomAuditPrice = async (stripe, priceId) => {
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product && typeof price.product === 'object' ? price.product : null;

  if (!price.active || price.recurring || price.currency !== 'usd' || price.unit_amount !== 3700 || product?.active === false) {
    const error = new Error('FREEDOM_AUDIT_STRIPE_PRICE_ID must be an active one-time USD $37 price.');
    error.statusCode = 503;
    throw error;
  }

  return { price, product };
};

const getOrCreateProfile = ensureProfile;

const isFreedomAuditPurchase = (product = {}) => {
  const configuredPriceId = getFreedomAuditPriceId();
  return product.priceId === configuredPriceId;
};

const hasFreedomAuditEntitlement = (profile) =>
  Boolean(profile?.purchasedProducts?.some((product) =>
    product.status === 'paid' && isFreedomAuditPurchase(product)
  ));

const buildEntitlementResponse = (profile) => ({
  entitled: hasFreedomAuditEntitlement(profile),
  product: FREEDOM_AUDIT_PRODUCT_SLUG,
  latestResult: hasFreedomAuditEntitlement(profile) ? profile?.freedomAudit?.latestResult || null : null,
});

const recordFreedomAuditPurchaseFromSession = async (session, userId) => {
  if (!session || session.payment_status !== 'paid') return null;

  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });

  const priceId = getFreedomAuditPriceId();
  const matchingItem = lineItems.data.find((lineItem) => lineItem.price?.id === priceId);
  if (!matchingItem) return null;

  const product = matchingItem.price?.product && typeof matchingItem.price.product === 'object'
    ? matchingItem.price.product
    : {};
  const purchase = {
    productId: product.id || session.metadata?.productId || FREEDOM_AUDIT_PRODUCT_SLUG,
    priceId,
    name: product.name || session.metadata?.productName || 'The Freedom Audit',
    tier: FREEDOM_AUDIT_TIER,
    amount: Number(matchingItem.amount_total ?? session.amount_total ?? 3700) / 100,
    currency: matchingItem.currency || session.currency || 'usd',
    checkoutSessionId: session.id,
    purchasedAt: new Date(),
    status: 'paid',
  };

  await recordPurchase(userId, purchase);
  return UserProfile.findOne({userId});
};

const createFreedomAuditCheckout = asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const priceId = getFreedomAuditPriceId();
  const { product } = await assertFreedomAuditPrice(stripe, priceId);
  const appUrl = getAppUrl();
  const userId = String(req.user?._id || '');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=canceled`,
    client_reference_id: userId,
    customer_email: req.user?.email || undefined,
    metadata: {
      userId,
      user_id: userId,
      productId: product?.id || '',
      product_id: product?.id || '',
      productSlug: FREEDOM_AUDIT_PRODUCT_SLUG,
      productName: 'The Freedom Audit',
      product_name: 'The Freedom Audit',
      priceId,
      price_id: priceId,
      tier: FREEDOM_AUDIT_TIER,
      source: 'freedom_audit_app',
    },
  });

  return res.status(200).json({ url: session.url });
});

const getFreedomAuditEntitlement = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  return res.json(buildEntitlementResponse(profile));
});

const verifyFreedomAuditSession = asyncHandler(async (req, res) => {
  const sessionId = String(req.body?.sessionId || req.query?.session_id || '').trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'A valid Stripe Checkout session id is required.' });
  }

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (error?.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Checkout session is invalid or expired.' });
    }
    throw error;
  }
  const userId = String(req.user._id);
  const sessionUserId = String(session.client_reference_id || session.metadata?.userId || session.metadata?.user_id || '');

  if (sessionUserId !== userId) {
    return res.status(403).json({ error: 'This checkout session does not belong to the signed-in user.' });
  }

  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') {
    return res.status(402).json({ error: 'Payment is not complete for this checkout session.' });
  }

  const profile = await recordFreedomAuditPurchaseFromSession(session, req.user._id);
  if (!profile || !hasFreedomAuditEntitlement(profile)) {
    return res.status(403).json({ error: 'This checkout session does not contain the configured Freedom Audit price.' });
  }

  return res.json(buildEntitlementResponse(profile));
});

const guidance = {
  time: {
    priority: 'Reclaim control of your calendar before adding more goals.',
    moves: [
      'Identify the three largest recurring drains on your time.',
      'Automate, batch, or eliminate one recurring task within 48 hours.',
      'Block a daily 60-90 minute freedom-building session before reactive work.',
    ],
    compression: {
      delete: 'Low-value recurring commitments that survive only from habit.',
      automate: 'Scheduling, reminders, repetitive research, formatting, summaries, and routine admin.',
      delegate: 'Tasks another qualified person or service can complete without your judgment.',
      execute: 'The single high-value action that requires your judgment, voice, or decision.',
    },
  },
  money: {
    priority: 'Strengthen cash flow and reduce financial fragility before expanding complexity.',
    moves: [
      'Calculate your exact monthly survival number and current runway.',
      'Choose one existing asset that can become a paid offer this week.',
      'Route new discretionary income toward buffer and productive assets before lifestyle expansion.',
    ],
    compression: {
      delete: 'Expenses or subscriptions that do not protect survival or produce meaningful value.',
      automate: 'Expense tracking, invoices, payment reminders, and recurring financial reporting.',
      delegate: 'Bookkeeping or administrative money tasks that do not require your final decision.',
      execute: 'Pricing, offer selection, and the revenue-producing action closest to a transaction.',
    },
  },
  obligations: {
    priority: 'Close the loops that are consuming attention and protect the few obligations that truly matter.',
    moves: [
      'List every open loop, then mark only those with real consequences in 30 days.',
      'Finish or schedule the highest-consequence open loop within 24 hours.',
      'Create one capture system so obligations stop living in your head.',
    ],
    compression: {
      delete: 'Optional commitments disguised as emergencies.',
      automate: 'Follow-up reminders, document organization, status tracking, and standard communications.',
      delegate: 'Errands and process steps that do not require your personal presence.',
      execute: 'The consequential decision or submission only you can authorize.',
    },
  },
  assets: {
    priority: 'Convert something you already know, own, or have built into a reusable productive asset.',
    moves: [
      'Inventory your top five underused skills, systems, documents, audiences, or tools.',
      'Package one into a clear outcome for one specific buyer.',
      'Publish a minimum viable offer before expanding the product.',
    ],
    compression: {
      delete: 'New projects that duplicate assets you have not yet monetized.',
      automate: 'Content repurposing, lead capture, delivery, onboarding, and first-pass production.',
      delegate: 'Polish and repetitive production after the core method is proven.',
      execute: 'Define the transformation, buyer, promise, and proprietary method.',
    },
  },
  desires: {
    priority: 'Turn vision into sequence: choose one measurable outcome and subordinate everything else to it for 30 days.',
    moves: [
      'Write one 30-day outcome with a measurable finish line.',
      'Name three projects you will deliberately not pursue this month.',
      'Create a weekly scoreboard containing no more than three numbers.',
    ],
    compression: {
      delete: 'Goals that are exciting but do not advance the chosen 30-day outcome.',
      automate: 'Progress tracking, recurring reviews, and information collection.',
      delegate: 'Support tasks that others can perform to protect your focus.',
      execute: 'The next irreversible action toward the chosen outcome.',
    },
  },
};

const sanitizeText = (value, fallback) => {
  if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)) {
    throw Object.assign(new Error('Assessment text must be a string of at most 1000 characters.'), { statusCode: 400 });
  }
  return (value || fallback).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
};

const validateRatings = (ratings = {}) => {
  const cleanRatings = {};
  for (const domain of DOMAIN_KEYS) {
    const values = Array.isArray(ratings[domain]) ? ratings[domain] : [];
    if (values.length !== 4) {
      const error = new Error(`The ${domain} domain requires exactly 4 ratings.`);
      error.statusCode = 400;
      throw error;
    }

    cleanRatings[domain] = values.map((value) => {
      const numeric = value;
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
        const error = new Error('All audit ratings must be integers from 1 through 5.');
        error.statusCode = 400;
        throw error;
      }
      return numeric;
    });
  }

  return cleanRatings;
};

const classifyStage = (score) => {
  if (score < 45) return 'Survive';
  if (score < 62) return 'Stabilize';
  if (score < 78) return 'Liberate';
  return 'Expand';
};

const buildBigSyzPrompt = ({ score, stage, domainScores, weakestDomain, win, drag, asset }) =>
  `Act as my execution strategist inside Big SYZ. I completed The Freedom Audit by T.O.I. Souljah Academy.

My overall Freedom Score is ${score}/100.
My current stage is ${stage}.
Domain scores: ${DOMAIN_KEYS.map((key) => `${key} ${domainScores[key]}/100`).join(', ')}.
My weakest domain is ${weakestDomain}.
My desired 30-day win is: ${win}
My biggest mental drag is: ${drag}
My underused asset is: ${asset}

Help me compress time without confusing speed with progress. Use four filters: DELETE, AUTOMATE, DELEGATE, EXECUTE. Identify the smallest number of actions that materially increase my control over my time, cash flow, and productive assets. Give me:
1. The single highest-leverage action for the next 24 hours.
2. Three actions for the next 7 days.
3. What I should deliberately ignore for 30 days.
4. Tasks AI can automate, with ready-to-use prompts.
5. One measurable weekly scoreboard with no more than three metrics.
Challenge unnecessary complexity. Do not add projects merely because they are interesting.`;

const scoreFreedomAudit = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  if (!hasFreedomAuditEntitlement(profile)) {
    return res.status(403).json({ error: 'A paid Freedom Audit entitlement is required.' });
  }

  const ratings = validateRatings(req.body?.ratings || {});
  const domainScores = Object.fromEntries(
    DOMAIN_KEYS.map((key) => [
      key,
      Math.round((ratings[key].reduce((sum, value) => sum + value, 0) / 20) * 100),
    ])
  );
  const score = Math.round(DOMAIN_KEYS.reduce((sum, key) => sum + domainScores[key], 0) / DOMAIN_KEYS.length);
  const stage = classifyStage(score);
  const weakestDomain = DOMAIN_KEYS.slice().sort((a, b) => domainScores[a] - domainScores[b])[0];
  const selectedGuidance = guidance[weakestDomain];
  const frictionPoints = DOMAIN_KEYS.flatMap(domain => ratings[domain].map((rating, index) => ({domain, question: index + 1, rating}))).filter(item => item.rating <= 3).sort((a,b) => a.rating - b.rating).slice(0,5);
  const secondaryDomain = DOMAIN_KEYS.filter(domain => domain !== weakestDomain).sort((a,b) => domainScores[a] - domainScores[b])[0];
  const win = sanitizeText(req.body?.win, 'the 30-day outcome I choose');
  const drag = sanitizeText(req.body?.drag, 'my highest-friction unfinished task');
  const asset = sanitizeText(req.body?.asset, 'my strongest underused asset');
  const result = {
    id: randomUUID(),
    score,
    stage,
    weakestDomain,
    highestLeveragePriority: `${weakestDomain.toUpperCase()}: ${selectedGuidance.priority}`,
    domainScores,
    leverageMoves: selectedGuidance.moves,
    frictionPoints,
    secondaryDomain,
    analysisMethod: 'Rules-based scoring of self-reported answers; not an AI-generated or clinical assessment.',
    compression: selectedGuidance.compression,
    liberationPlan: [
      `Days 1-3 - IDENTIFY: Review your lowest individual ratings (${frictionPoints.slice(0,3).map(p => `${p.domain} question ${p.question}: ${p.rating}/5`).join('; ') || 'none below 4/5'}). Choose a concrete constraint and set the finish line: ${win}.`,
      `Days 4-7 - COMPRESS: Address ${drag}. Identify one task to remove, automate or delegate and review the effect on ${weakestDomain} and ${secondaryDomain}.`,
      `Days 8-14 - BUILD: Turn ${asset} into one concrete asset, offer, workflow, or system that increases future freedom.`,
      'Days 15-21 - DEPLOY: Put the asset into real use. Seek a transaction, measurable result, or external proof instead of more preparation.',
      'Days 22-27 - OPTIMIZE: Keep what produces results. Remove what creates motion without progress.',
      'Days 28-30 - RE-AUDIT: Re-score the five domains, measure the result, and choose the next bottleneck.',
    ],
    inputs: { ratings, win, drag, asset },
    completedAt: new Date(),
  };
  const lease = randomUUID();
  const locked = await UserProfile.findOneAndUpdate({ userId: req.user._id,
    $or: [{ 'freedomAudit.generationExpiresAt': { $lte: new Date() } }, { 'freedomAudit.generationExpiresAt': null }]
  }, { $set: { 'freedomAudit.generationLease': lease, 'freedomAudit.generationExpiresAt': new Date(Date.now() + 60000) } });
  if (!locked) return res.status(409).json({error:'A plan is already being generated. Please wait before retrying.'});
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45000);
  const disconnect = () => { if (!res.writableEnded) abort.abort(); };
  res.on('close', disconnect);
  try {
    const personalized = await generatePersonalizedPlan({ratings,domainScores,score,stage,weakestDomain,secondaryDomain,frictionPoints,win,drag,asset}, {signal:abort.signal});
    if (abort.signal.aborted) throw Object.assign(new Error('Generation timed out or was canceled. Please retry; no new result was saved.'), {statusCode:504});
    if (personalized) {
      result.highestLeveragePriority = personalized.priority;
      result.leverageMoves = personalized.moves;
      result.compression = personalized.compression;
      result.liberationPlan = personalized.plan;
      result.analysisMethod = personalized.analysisMethod;
      result.planEvidence = personalized.planEvidence;
      result.providerModel = personalized.providerModel;
    }
    result.bigSyzPrompt = buildBigSyzPrompt({ ...result, win, drag, asset });

    const saved = await UserProfile.findOneAndUpdate({ userId: req.user._id, 'freedomAudit.generationLease': lease,
      purchasedProducts: { $elemMatch: {priceId:getFreedomAuditPriceId(), status:'paid'} }
    }, { $set: {'freedomAudit.latestResult':result}, $push: {'freedomAudit.results': {$each:[result], $slice:-MAX_RESULT_HISTORY}} }, {new:true, runValidators:true});
    if (!saved) return res.status(409).json({error:'Access changed while generating. No result was saved. Please refresh your access.'});
    return res.status(201).json({ result });
  } finally {
    clearTimeout(timer);
    res.off('close', disconnect);
    await UserProfile.updateOne({userId:req.user._id, 'freedomAudit.generationLease':lease}, {$unset:{'freedomAudit.generationLease':1,'freedomAudit.generationExpiresAt':1}});
  }
});

const getFreedomAuditResults = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user._id);
  if (!hasFreedomAuditEntitlement(profile)) return res.status(403).json({error:'A paid Freedom Audit entitlement is required.'});
  return res.json({results: [...(profile.freedomAudit?.results || [])].reverse()});
});

module.exports = {
  getFreedomAuditResults,
  createFreedomAuditCheckout,
  getFreedomAuditEntitlement,
  verifyFreedomAuditSession,
  scoreFreedomAudit,
  FREEDOM_AUDIT_TIER,
};
