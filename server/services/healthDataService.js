const { buildHealthConnectContract, normalizeSleepImport } = require('../integrations/healthConnect/client');

const getHealthIntegrationMeta = () => ({
  activeProvider: 'health_connect',
  contract: buildHealthConnectContract(),
  roadmap: ['health_connect_now', 'samsung_health_data_sdk_later'],
});

const parseSleepPayload = (payload) => normalizeSleepImport(payload);

module.exports = { getHealthIntegrationMeta, parseSleepPayload };
