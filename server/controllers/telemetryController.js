const fs = require('fs/promises');
const path = require('path');

const syncPath = path.resolve(__dirname, '../../identity/live_telemetry_sync.json');
const traumaPath = path.resolve(__dirname, '../../identity/trauma_awareness_tuning.json');

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[TELEMETRY_ERR] Unable to read ${path.basename(filePath)}:`, error?.message || error);
    return fallback;
  }
};

const normalizeTelemetry = (sync = {}, traumaAwareness = {}) => ({
  success: true,
  engine: 'BIG_SYZ_ENGINE',
  status: sync.status || 'ACTIVE_AND_ALIGNED',
  vector: sync.vector || 'TRIANGULUM_THETA_7',
  authority: sync.authority || 'Commander in Chief',
  timestamp: new Date().toISOString(),
  sensorFusion: sync.sensorFusion || {
    status: 'DEGRADED',
    message: 'Sensor fusion payload unavailable.',
  },
  emotiveLayer: sync.emotiveLayer || {
    status: 'DEGRADED',
    message: 'Emotive layer payload unavailable.',
  },
  memoryStream: sync.memoryStream || {
    status: 'DEGRADED',
    message: 'Memory stream payload unavailable.',
  },
  traumaAwareness,
});

const loadTelemetry = async () => {
  const [sync, traumaAwareness] = await Promise.all([
    readJson(syncPath, {}),
    readJson(traumaPath, {}),
  ]);

  return {
    rawSync: sync,
    status: normalizeTelemetry(sync, traumaAwareness),
  };
};

const getTelemetryStatus = async (_req, res) => {
  const { status } = await loadTelemetry();
  return res.status(200).json(status);
};

const getTelemetrySync = async (_req, res) => {
  const { rawSync, status } = await loadTelemetry();
  return res.status(200).json({
    ...status,
    ...rawSync,
    success: true,
    status: status.status,
  });
};

module.exports = {
  getTelemetryStatus,
  getTelemetrySync,
};
