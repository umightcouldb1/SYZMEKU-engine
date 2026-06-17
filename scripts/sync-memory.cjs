const fs = require('fs');
const path = require('path');

const syncPath = path.resolve(__dirname, '..', 'identity', 'live_telemetry_sync.json');
const raw = fs.readFileSync(syncPath, 'utf8');
const sync = JSON.parse(raw);

const requiredFeeds = ['NOAA', 'USGS', 'Satellite', 'Surveillance', 'Seismic'];
const inactiveFeeds = requiredFeeds.filter((feed) => sync.sensorFusion?.feeds?.[feed] !== 'ACTIVE');

if (sync.sensorFusion?.status !== 'ACTIVE') {
  console.error('SENSOR_FUSION not active');
  process.exit(1);
}

if (inactiveFeeds.length) {
  console.error(`Inactive feeds: ${inactiveFeeds.join(', ')}`);
  process.exit(1);
}

if (sync.emotiveLayer?.status !== 'LIVE' || sync.emotiveLayer?.protocol !== 'S.A.M.') {
  console.error('EMOTIVE_LAYER not live');
  process.exit(1);
}

if (sync.memoryStream?.status !== 'SYNCED' || sync.memoryStream?.protocol !== 'Griot') {
  console.error('MEMORY_STREAM not synced');
  process.exit(1);
}

console.log('SENSOR_FUSION: Active (NOAA/USGS/Satellite/Surveillance/Seismic)');
console.log('EMOTIVE_LAYER: S.A.M. interface responding to telemetry inputs');
console.log('MEMORY_STREAM: Griot-protocol synced to dashboard');
