import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const apiBase = process.env.FREEDOM_AUDIT_API_BASE_URL || process.env.VITE_API_BASE_URL || 'https://syzmeku-api.onrender.com/api';
const bigSyzUrl = process.env.FREEDOM_AUDIT_BIG_SYZ_URL || process.env.VITE_BIG_SYZ_URL || 'https://www.toisouljahacademy.com';
// Public web client ID shared with Big SYZ; the server verifies the same audience.
const googleClientId = process.env.FREEDOM_AUDIT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '994975817231-obs40351opa36ljffmelqb4o3vtru044.apps.googleusercontent.com';
if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
  throw new Error('Freedom Audit requires a valid Google web client ID.');
}

const template = readFileSync(join(root, 'index.html'), 'utf8');
const rendered = template
  .replaceAll('__FREEDOM_AUDIT_API_BASE__', apiBase.replace(/\/+$/, ''))
  .replaceAll('__FREEDOM_AUDIT_BIG_SYZ_URL__', bigSyzUrl)
  .replaceAll('__FREEDOM_AUDIT_GOOGLE_CLIENT_ID__', googleClientId);

writeFileSync(join(dist, 'index.html'), rendered);
copyFileSync(join(root, 'vercel.json'), join(dist, 'vercel.json'));

console.log(`Freedom Audit build complete. API base: ${apiBase}`);
