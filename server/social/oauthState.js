const crypto = require('crypto');
const SocialOAuthState = require('../models/SocialOAuthState');

const STATE_TTL_MINUTES = 15;

const base64url = (buffer) => Buffer.from(buffer).toString('base64url');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('base64url');

const createPkcePair = () => {
  const verifier = base64url(crypto.randomBytes(48));
  return {
    codeVerifier: verifier,
    codeChallenge: sha256(verifier),
    codeChallengeMethod: 'S256',
  };
};

const createOAuthState = async ({ userId, provider, redirectUri, scopes = [], usePkce = true }) => {
  const rawState = base64url(crypto.randomBytes(32));
  const pkce = usePkce ? createPkcePair() : { codeVerifier: '', codeChallenge: '', codeChallengeMethod: '' };
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000);

  await SocialOAuthState.create({
    userId,
    provider,
    redirectUri,
    scopes,
    stateHash: sha256(rawState),
    codeVerifier: pkce.codeVerifier,
    expiresAt,
  });

  return { state: rawState, ...pkce, expiresAt };
};

const consumeOAuthState = async ({ provider, state }) => {
  const record = await SocialOAuthState.findOne({
    provider,
    stateHash: sha256(String(state || '')),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+codeVerifier');

  if (!record) {
    const error = new Error('OAuth state is invalid or expired.');
    error.statusCode = 400;
    throw error;
  }

  record.consumedAt = new Date();
  await record.save();
  return record;
};

module.exports = { createOAuthState, consumeOAuthState, sha256 };
