const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { protect } = require('../../middleware/authMiddleware');
const { soundKeyMatcher } = require('../../middleware/soundKeyMatcher');
const SoundKeyLog = require('../../models/SoundKeyLog');

const router = express.Router();

router.post(
  '/log',
  soundKeyMatcher,
  protect,
  expressAsyncHandler(async (req, res) => {
    const { frequency, timestamp, activationKey } = req.body;

    if (typeof frequency !== 'number') {
      res.status(400).json({ message: 'Frequency must be a number.' });
      return;
    }

    const logEntry = await SoundKeyLog.create({
      userId: req.user._id,
      frequency,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      activationKey: activationKey || '',
    });

    res.status(201).json({
      message: 'Sound key logged',
      log: logEntry,
    });
  }),
);

router.post(
  '/match',
  soundKeyMatcher,
  protect,
  expressAsyncHandler(async (req, res) => {
    res.status(200).json({
      message: 'Batch matching not implemented',
      received: req.body || null,
    });
  }),
);

module.exports = router;
