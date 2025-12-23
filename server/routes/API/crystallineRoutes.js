const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { protect } = require('../../middleware/authMiddleware');
const { soundKeyMatcher } = require('../../middleware/soundKeyMatcher');

const router = express.Router();

router.post(
  '/trigger-crystalline-grid',
  soundKeyMatcher,
  protect,
  expressAsyncHandler(async (req, res) => {
    const { frequency, user_id: userId } = req.body;

    if (typeof frequency !== 'number') {
      res.status(400).json({ message: 'frequency must be a number.' });
      return;
    }

    res.status(200).json({
      status: 'CRYSTALLINE_GRID_TRIGGERED',
      frequency,
      user_id: userId || req.user.id,
    });
  }),
);

module.exports = router;
