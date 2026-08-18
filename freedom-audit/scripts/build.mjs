import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const apiBase = process.env.FREEDOM_AUDIT_API_BASE_URL || process.env.VITE_API_BASE_URL || 'https://syzmeku-api.onrender.com/api';
const bigSyzUrl = process.env.FREEDOM_AUDIT_BIG_SYZ_URL || process.env.VITE_BIG_SYZ_URL || 'https://www.toisouljahacademy.com';

const template = readFileSync(join(root, 'index.html'), 'utf8');
const rendered = template
  .replaceAll('__FREEDOM_AUDIT_API_BASE__', apiBase.replace(/\/+$/, ''))
  .replaceAll('__FREEDOM_AUDIT_BIG_SYZ_URL__', bigSyzUrl);

writeFileSync(join(dist, 'index.html'), rendered);
copyFileSync(join(root, 'vercel.json'), join(dist, 'vercel.json'));

console.log(`Freedom Audit build complete. API base: ${apiBase}`);
