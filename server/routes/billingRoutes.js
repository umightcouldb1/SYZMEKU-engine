const crypto = require('crypto');
const router = require('express').Router();
const {
  GENESIS_SEAT_LIMIT,
  GenesisCounter,
  GenesisPatron,
} = require('../models/GenesisPatron');

const COUNTER_KEY = 'genesis-lifetime-seats';

const normalizeIdentifier = (value = '') => String(value || '').trim().toLowerCase();

const isValidIdentifier = (value = '') => {
  const identifier = normalizeIdentifier(value);
  if (identifier.length < 3 || identifier.length > 160) return false;
  return /^[a-z0-9][a-z0-9._+@-]*[a-z0-9]$/.test(identifier);
};

const getRequestIpHash = (req) => {
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  return crypto.createHash('sha256').update(String(rawIp).split(',')[0].trim()).digest('hex');
};

const getCurrentSeatCount = async () => GenesisPatron.countDocuments({ tier: 'Genesis_Lifetime', status: { $ne: 'cancelled' } });

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

router.get('/genesis-status', async (_req, res) => {
  try {
    const claimedSeats = await getCurrentSeatCount();
    const remainingSeats = Math.max(GENESIS_SEAT_LIMIT - claimedSeats, 0);

    return res.json({
      success: true,
      tier: 'Genesis_Lifetime',
      seatLimit: GENESIS_SEAT_LIMIT,
      claimedSeats,
      remainingSeats,
      gateStatus: remainingSeats > 0 ? 'open' : 'closed',
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
        message: 'A valid patron identifier is required to reserve a Genesis seat.',
      });
    }

    const existingPatron = await GenesisPatron.findOne({ patronIdentifier }).lean();
    if (existingPatron && existingPatron.status !== 'cancelled') {
      return res.json({
        success: true,
        duplicate: true,
        message: 'Genesis seat already reserved for this patron identifier.',
        tier: existingPatron.tier,
        status: existingPatron.status,
        seatAllocation: existingPatron.seatNumber,
        seatLimit: GENESIS_SEAT_LIMIT,
      });
    }

    const activeSeatCount = await getCurrentSeatCount();
    if (activeSeatCount >= GENESIS_SEAT_LIMIT) {
      return res.status(403).json({
        success: false,
        message: 'Sovereign Genesis Circle is fully populated. Gate closed.',
        seatLimit: GENESIS_SEAT_LIMIT,
        claimedSeats: activeSeatCount,
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
        status: 'reserved',
        metadata: {
          userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          ipHash: getRequestIpHash(req),
        },
      });
    } catch (createError) {
      if (createError?.code === 11000) {
        const fallbackPatron = await GenesisPatron.findOne({ patronIdentifier }).lean();
        if (fallbackPatron) {
          return res.json({
            success: true,
            duplicate: true,
            message: 'Genesis seat already reserved for this patron identifier.',
            tier: fallbackPatron.tier,
            status: fallbackPatron.status,
            seatAllocation: fallbackPatron.seatNumber,
            seatLimit: GENESIS_SEAT_LIMIT,
          });
        }
      }
      throw createError;
    }

    const remainingSeats = Math.max(GENESIS_SEAT_LIMIT - seatNumber, 0);
    return res.status(201).json({
      success: true,
      message: 'Energy exchange cleared. Genesis seat successfully reserved.',
      tier: patron.tier,
      status: patron.status,
      seatAllocation: patron.seatNumber,
      seatLimit: GENESIS_SEAT_LIMIT,
      remainingSeats,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'System lag on Genesis registration entry.',
      details: String(error?.message || error).slice(0, 300),
    });
  }
});

module.exports = router;
