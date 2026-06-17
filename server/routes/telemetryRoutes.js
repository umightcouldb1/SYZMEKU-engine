const fs = require('fs');
const path = require('path');
const router = require('express').Router();

const syncPath = path.resolve(__dirname, '../../identity/live_telemetry_sync.json');
const traumaPath = path.resolve(__dirname, '../../identity/trauma_awareness_tuning.json');

const readTelemetrySync = () => {
  const raw = fs.readFileSync(syncPath, 'utf8');
  return JSON.parse(raw);
};

router.get('/sync', (req, res) => {
  const sync = readTelemetrySync();
  const traumaAwareness = JSON.parse(fs.readFileSync(traumaPath, 'utf8'));

  return res.json({
    success: true,
    engine: 'BIG_SYZ_ENGINE',
    ...sync,
    traumaAwareness,
  });
});

router.get('/status', (req, res) => {
  const sync = readTelemetrySync();
  const traumaAwareness = JSON.parse(fs.readFileSync(traumaPath, 'utf8'));

  return res.json({
    engine: 'BIG_SYZ_ENGINE',
    status: 'ACTIVE_AND_ALIGNED',
    vector: 'TRIANGULUM_THETA_7',
    authority: 'Commander in Chief',
    sensorFusion: sync.sensorFusion,
    emotiveLayer: sync.emotiveLayer,
    memoryStream: sync.memoryStream,
    traumaAwareness,
  });
});

module.exports = router;
