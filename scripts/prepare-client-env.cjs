const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const clientEnvPath = path.join(rootDir, 'client', '.env.production');

const CANONICAL_GOOGLE_CLIENT_ID = '994975817231-obs40351opa36ljffmelqb4o3vtru044.apps.googleusercontent.com';
const configuredGoogleClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const isValidGoogleClientId = (clientId = '') =>
  /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId);

const viteGoogleClientId = configuredGoogleClientId === CANONICAL_GOOGLE_CLIENT_ID
  ? configuredGoogleClientId
  : CANONICAL_GOOGLE_CLIENT_ID;
const viteApiUrl = process.env.VITE_API_URL || 'https://syzmeku-api.onrender.com';

const lines = [];

if (viteGoogleClientId) {
  if (configuredGoogleClientId && configuredGoogleClientId !== viteGoogleClientId) {
    console.warn('[build-env] VITE_GOOGLE_CLIENT_ID did not match the canonical browser client. Using canonical client ID for this build.');
  }

  if (!isValidGoogleClientId(viteGoogleClientId)) {
    console.warn('[build-env] VITE_GOOGLE_CLIENT_ID is not a valid Google web client ID. Google login will be hidden in the compiled client.');
  } else {
    lines.push(`VITE_GOOGLE_CLIENT_ID=${viteGoogleClientId}`);
  }
} else {
  console.warn('[build-env] VITE_GOOGLE_CLIENT_ID is not set. Google login will be hidden in the compiled client.');
}

if (viteApiUrl) {
  lines.push(`VITE_API_URL=${viteApiUrl}`);
}

if (!lines.length) {
  try {
    if (fs.existsSync(clientEnvPath)) fs.unlinkSync(clientEnvPath);
  } catch (error) {
    console.warn(`[build-env] Unable to remove stale client env file: ${error.message}`);
  }
  process.exit(0);
}

fs.writeFileSync(clientEnvPath, `${lines.join('\n')}\n`, { encoding: 'utf8' });
console.log(`[build-env] Wrote ${lines.length} Vite build variable(s) to client/.env.production.`);
