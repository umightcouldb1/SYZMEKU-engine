const router = require('express').Router();
const {
  getTelemetryStatus,
  getTelemetrySync,
} = require('../controllers/telemetryController');

router.get('/sync', getTelemetrySync);
router.get('/status', getTelemetryStatus);

module.exports = router;
