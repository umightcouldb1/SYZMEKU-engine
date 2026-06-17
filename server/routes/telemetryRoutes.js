const fs = require('fs');
const path = require('path');
const router = require('express').Router();

const syncPath = path.resolve(__dirname, '../../identity/live_telemetry_sync.json');

const readTelemetrySync = () => {
  const raw = fs.readFileSync(syncPath, 'utf8');
  return JSON.parse(raw);
};

router.get('/sync', (req, res) => {
  const sync = readTelemetrySync();

  return res.json({
    success: true,
    engine: 'BIG_SYZ_ENGINE',
    ...sync,
  });
});

router.get('/status', (req, res) => {
  const sync = readTelemetrySync();

  return res.json({
    engine: 'BIG_SYZ_ENGINE',
    status: 'ACTIVE_AND_ALIGNED',
    vector: 'TRIANGULUM_THETA_7',
    authority: 'Commander in Chief',
    sensorFusion: sync.sensorFusion,
    emotiveLayer: sync.emotiveLayer,
    memoryStream: sync.memoryStream,
  });
});

module.exports = router;
