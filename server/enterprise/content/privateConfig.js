'use strict';

// Independent server-only pins. Never infer authority from an OAuth response,
// caller input, a draft reference, or another account setting.
const EMAIL_KEY = 'CONTENT_FACTORY_WORKSPACE_EMAIL';
const LOGO_KEY = 'CONTENT_FACTORY_ORIGINAL_LOGO_FILE_ID';
const fail = code => { throw Object.assign(new Error(code), { statusCode: 503 }); };

function readPrivateConfig(env = process.env) {
  const email = env[EMAIL_KEY], logo = env[LOGO_KEY];
  if (email === undefined || email === '') fail('GOOGLE_WORKSPACE_EMAIL_CONFIG_REQUIRED');
  if (typeof email !== 'string' || email.length > 254 || email !== email.trim()
    || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(email)
    || email.split('@')[0].length > 64 || email.startsWith('.') || email.includes('..') || email.includes('.@')) {
    fail('GOOGLE_WORKSPACE_EMAIL_CONFIG_INVALID');
  }
  if (logo === undefined || logo === '') fail('GOOGLE_WORKSPACE_LOGO_CONFIG_REQUIRED');
  if (typeof logo !== 'string' || !/^[a-zA-Z0-9_-]{10,150}$/.test(logo)) fail('GOOGLE_WORKSPACE_LOGO_CONFIG_INVALID');
  return Object.freeze({ BUSINESS_ACCOUNT: email.toLowerCase(), ORIGINAL_LOGO_FILE_ID: logo });
}

// Read-only screens and app imports remain usable before private configuration.
function privateConfigStatus(env = process.env) {
  try { return { configured: true, config: readPrivateConfig(env), code: null }; }
  catch (error) { return { configured: false, config: null, code: error.message }; }
}

module.exports = { readPrivateConfig, privateConfigStatus, EMAIL_KEY, LOGO_KEY };
