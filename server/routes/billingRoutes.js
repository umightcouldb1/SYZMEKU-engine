const crypto = require('crypto');
const router = require('express').Router();
const {
  GENESIS_SEAT_LIMIT,
  PAID_GENESIS_STATUSES,
  GenesisCounter,
  GenesisPatron,
} = require('../models/GenesisPatron');

const COUNTER_KEY = 'genesis-lifetime-seats';

const normalizeIdentifier = (value = '') => String(value || '').trim().toLowerCase();
const normalizePaymentReference = (value = '') => String(value || '').trim();

const isValidIdentifier = (value = '') => {
  const identifier = normalizeIdentifier(value);
  if (identifier.length < 3 || identifier.length > 160) return false;
  return /^[a-z0-9][a-z0-9._+@-]*[a-z0-9]$/.test(identifier);
};

const getRequestIpHash = (req) => {
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  return crypto.createHash('sha256').update(String(rawIp).split(',')[0].trim()).digest('hex');
};

const getPaidSeatCount = async () => GenesisPatron.countDocuments({
  tier: 'Genesis_Lifetime',
  status: { $in: PAID_GENESIS_STATUSES },
});

const reserveNextSeatNumber = async () => {
  await GenesisCounter.findOneAndUpdate(
    { key: COUNTER_KEY },
    { $setOnInsert: { key: COUNTER_KEY, sequence: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const counter = await GenesisCounter.findOneAndUpdate(
    { key: COUNTER_KEY, sequence: { $lt: GENESIS_SEAT_LIMIT } },
    { $inc: { sequence: 1 } },
    { new: true }
  );

  if (!counter) return null;
  return counter.sequence;
};

const buildSeatPayload = (patron, options = {}) => ({
  success: true,
  tier: patron.tier,
  status: patron.status,
  seatAllocation: patron.seatNumber,
  seatLimit: GENESIS_SEAT_LIMIT,
  paymentReference: patron.payment?.reference || undefined,
  ...options,
});

const requirePaymentConfirmationSecret = (req, res) => {
  const expectedSecret = process.env.GENESIS_PAYMENT_CONFIRMATION_SECRET;
  if (!expectedSecret) {
    res.status(503).json({
      success: false,
      message: 'Genesis payment confirmation is not configured on this service.',
    });
    return false;
  }

  const incomingSecret = String(req.headers['x-genesis-payment-secret'] || '');
  if (incomingSecret !== expectedSecret) {
    res.status(401).json({
      success: false,
      message: 'Genesis payment confirmation is not authorized.',
    });
    return false;
  }

  return true;
};

router.get('/genesis-status', async (_req, res) => {
  try {
    const claimedSeats = await getPaidSeatCount();
    const remainingSeats = Math.max(GENESIS_SEAT_LIMIT - claimedSeats, 0);

    return res.json({
      success: true,
      tier: 'Genesis_Lifetime',
      seatLimit: GENESIS_SEAT_LIMIT,
      claimedSeats,
      remainingSeats,
      gateStatus: remainingSeats > 0 ? 'open' : 'closed',
      allocationRule: 'Genesis seats are issued only after payment confirmation.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to read Genesis ledger status.',
      details: String(error?.message || error).slice(0, 300),
    });
  }
});

router.post('/genesis-lock', async (req, res) => {
  try {
    const patronIdentifier = normalizeIdentifier(req.body?.patronIdentifier || req.body?.email || req.body?.identifier);

    if (!isValidIdentifier(patronIdentifier)) {
      return res.status(400).json({
        success: false,
        message: 'A valid patron identifier is required before Genesis payment can be matched.',
      });
    }

    const existingPatron = await GenesisPatron.findOne({
      patronIdentifier,
      status: { $in: PAID_GENESIS_STATUSES },
    }).lean();

    if (existingPatron) {
      return res.json(buildSeatPayload(existingPatron, {
        duplicate: true,
        message: 'Genesis seat already issued for this paid patron identifier.',
      }));
    }

    const claimedSeats = await getPaidSeatCount();
    const remainingSeats = Math.max(GENESIS_SEAT_LIMIT - claimedSeats, 0);

    if (remainingSeats <= 0) {
      return res.status(403).json({
        success: false,
        message: 'Sovereign Genesis Circle is fully populated. Gate closed.',
        seatLimit: GENESIS_SEAT_LIMIT,
        claimedSeats,
        remainingSeats: 0,
      });
    }

    return res.status(402).json({
      success: false,
      message: 'Payment is required before a Genesis seat can be issued.',
      nextAction: 'complete_payment',
      tier: 'Genesis_Lifetime',
      seatLimit: GENESIS_SEAT_LIMIT,
      claimedSeats,
      remainingSeats,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'System lag while checking Genesis payment readiness.',
      details: String(error?.message || error).slice(0, 300),
    });
  }
});

router.post('/genesis-payment-confirmed', async (req, res) => {
  if (!requirePaymentConfirmationSecret(req, res)) return undefined;

  try {
    const patronIdentifier = normalizeIdentifier(req.body?.patronIdentifier || req.body?.email || req.body?.identifier);
    const paymentReference = normalizePaymentReference(req.body?.paymentReference || req.body?.paymentId || req.body?.checkoutSessionId);
    const paymentProvider = normalizeIdentifier(req.body?.paymentProvider || req.body?.provider || 'manual');
    const paymentAmountCents = Number.isFinite(Number(req.body?.paymentAmountCents))
      ? Math.max(0, Math.round(Number(req.body.paymentAmountCents)))
      : 0;
    const currency = normalizeIdentifier(req.body?.currency || 'usd') || 'usd';

    if (!isValidIdentifier(patronIdentifier)) {
      return res.status(400).json({
        success: false,
        message: 'A valid patron identifier is required to issue a Genesis seat.',
      });
    }

    if (!paymentReference || paymentReference.length < 3 || paymentReference.length > 180) {
      return res.status(400).json({
        success: false,
        message: 'A valid payment reference is required to issue a Genesis seat.',
      });
    }

    const existingPatron = await GenesisPatron.findOne({
      $or: [
        { patronIdentifier, status: { $in: PAID_GENESIS_STATUSES } },
        { 'payment.reference': paymentReference },
      ],
    }).lean();

    if (existingPatron) {
      return res.json(buildSeatPayload(existingPatron, {
        duplicate: true,
        message: 'Genesis seat already issued for this confirmed payment.',
      }));
    }

    const paidSeatCount = await getPaidSeatCount();
    if (paidSeatCount >= GENESIS_SEAT_LIMIT) {
      return res.status(403).json({
        success: false,
        message: 'Sovereign Genesis Circle is fully populated. Gate closed.',
        seatLimit: GENESIS_SEAT_LIMIT,
        claimedSeats: paidSeatCount,
        remainingSeats: 0,
      });
    }

    const seatNumber = await reserveNextSeatNumber();
    if (!seatNumber) {
      return res.status(403).json({
        success: false,
        message: 'Sovereign Genesis Circle is fully populated. Gate closed.',
        seatLimit: GENESIS_SEAT_LIMIT,
        claimedSeats: GENESIS_SEAT_LIMIT,
        remainingSeats: 0,
      });
    }

    let patron;
    try {
      patron = await GenesisPatron.create({
        patronIdentifier,
        tier: 'Genesis_Lifetime',
        seatNumber,
        status: 'paid',
        source: 'payment-confirmation',
        payment: {
          provider: paymentProvider,
          reference: paymentReference,
          amountCents: paymentAmountCents,
          currency,
          paidAt: new Date(),
        },
        metadata: {
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          ipHash: getRequestIpHash(req),
        },
      });
    } catch (createError) {
      if (createError?.code === 11000) {
        const fallbackPatron = await GenesisPatron.findOne({
          $or: [{ patronIdentifier }, { 'payment.reference': paymentReference }],
        }).lean();

        if (fallbackPatron) {
          return res.json(buildSeatPayload(fallbackPatron, {
            duplicate: true,
            message: 'Genesis seat already issued for this confirmed payment.',
          }));
        }
      }
      throw createError;
    }

    const remainingSeats = Math.max(GENESIS_SEAT_LIMIT - seatNumber, 0);
    return res.status(201).json(buildSeatPayload(patron, {
      message: 'Payment confirmed. Genesis seat successfully issued.',
      remainingSeats,
    }));
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'System lag on Genesis payment confirmation entry.',
      details: String(error?.message || error).slice(0, 300),
    });
  }
});

module.exports = router;
