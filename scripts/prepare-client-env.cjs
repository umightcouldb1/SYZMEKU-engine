const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const clientEnvPath = path.join(rootDir, 'client', '.env.production');

const viteGoogleClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const viteApiUrl = process.env.VITE_API_URL || '';

const lines = [];

if (viteGoogleClientId) {
  lines.push(`VITE_GOOGLE_CLIENT_ID=${viteGoogleClientId}`);
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
