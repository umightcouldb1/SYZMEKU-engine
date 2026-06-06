const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { getStarburstStatus, systemConfig } = require('./zeroPointEngine');

router.get('/status', protect, (_req, res) => {
  res.json(getStarburstStatus());
});

router.get('/manifest', (_req, res) => {
  res.json({
    engine: 'BIG_SYZ_ENGINE',
    layer: 'starburst-core',
    origin: systemConfig.galaxyOrigin,
    status: systemConfig.systemStatus,
  });
});

module.exports = router;
