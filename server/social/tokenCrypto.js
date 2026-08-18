const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

const getKey = () => {
  const configured = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    const error = new Error('SOCIAL_TOKEN_ENCRYPTION_KEY is required for social token encryption.');
    error.statusCode = 503;
    throw error;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(configured) && Buffer.from(configured, 'base64').length === KEY_BYTES) {
    return Buffer.from(configured, 'base64');
  }

  if (/^[a-f0-9]{64}$/i.test(configured)) {
    return Buffer.from(configured, 'hex');
  }

  return crypto.createHash('sha256').update(configured).digest();
};

const encryptToken = (value = '') => {
  if (!value) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
};

const decryptToken = (payload = '') => {
  if (!payload) return '';
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(payload).split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Encrypted social token payload is invalid.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = { encryptToken, decryptToken };
