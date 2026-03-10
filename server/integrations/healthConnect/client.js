const buildHealthConnectContract = () => ({
  provider: 'health_connect',
  platform: 'android',
  capabilities: ['sleep'],
  statusValues: ['disconnected', 'pending', 'connected', 'error'],
});

const normalizeSleepImport = (payload = {}) => ({
  sleepHours: Number(payload.sleepHours || payload.durationHours || 0),
  source: 'health_connect',
  capturedAt: payload.capturedAt || new Date().toISOString(),
});

module.exports = { buildHealthConnectContract, normalizeSleepImport };
