const WorkspaceConnection = require('../../models/WorkspaceConnection');
const { createOAuthState, consumeOAuthState } = require('../../social/oauthState');
const { encryptToken, decryptToken } = require('../../social/tokenCrypto');
const { requestJson } = require('../../social/providers/http');

const PROVIDER = 'google_workspace';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/presentations',
];

const fail = (code, statusCode = 409) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  throw error;
};

const workspaceError = (error) => ({
  code: String(error?.message || 'GOOGLE_WORKSPACE_REAUTH_REQUIRED').slice(0, 160),
  statusCode: error?.statusCode || null,
  providerError: typeof error?.providerPayload?.error === 'string'
    ? String(error.providerPayload.error).slice(0, 120)
    : null,
  providerStatus: error?.providerPayload?.error_description ? 'PROVIDER_REJECTED' : null,
  observedAt: new Date(),
});

const firstConfiguredOrigin = () => String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)[0];

const commanderReturnUrl = (params = {}) => {
  const base = process.env.CONTENT_FACTORY_APP_URL
    || (process.env.DOMAIN ? `${process.env.DOMAIN.replace(/\/$/, '')}/app/commander` : '')
    || (firstConfiguredOrigin() ? `${firstConfiguredOrigin().replace(/\/$/, '')}/app/commander` : '')
    || 'http://localhost:5173/app/commander';
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const credentials = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.CONTENT_FACTORY_GOOGLE_REDIRECT_URI
    || process.env.GOOGLE_WORKSPACE_REDIRECT_URI
    || process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) fail('GOOGLE_WORKSPACE_OAUTH_NOT_CONFIGURED', 503);
  return { clientId, clientSecret, redirectUri };
};

const safeConnection = (connection, tokenRefresh = 'UNKNOWN') => ({
  connected: !!connection && connection.status === 'connected',
  accountEmail: connection?.accountEmail || '',
  scopes: connection?.scopes || [],
  status: connection?.status || 'missing',
  tokenExpiresAt: connection?.tokenExpiresAt || null,
  connectedAt: connection?.connectedAt || null,
  lastVerifiedAt: connection?.lastVerifiedAt || null,
  tokenRefresh,
  drive: connection?.metadata?.drive || { status: 'UNKNOWN' },
  canonicalStorage: connection?.metadata?.canonicalStorage || null,
});

const beginAuthorization = async ({ userId }) => {
  const { clientId, redirectUri } = credentials();
  const oauthState = await createOAuthState({
    userId,
    provider: PROVIDER,
    redirectUri,
    scopes: SCOPES,
    usePkce: true,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', oauthState.state);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('code_challenge', oauthState.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { authorizationUrl: url.toString(), expiresAt: oauthState.expiresAt, scopes: SCOPES };
};

const exchangeCode = async ({ code, codeVerifier }) => {
  const { clientId, clientSecret, redirectUri } = credentials();
  return requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  });
};

const refreshAccessToken = async (connection) => {
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  if (!refreshToken) fail('GOOGLE_WORKSPACE_REAUTH_REQUIRED');
  const { clientId, clientSecret } = credentials();
  const tokenSet = await requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenSet.access_token) fail('GOOGLE_WORKSPACE_REAUTH_REQUIRED');
  connection.encryptedAccessToken = encryptToken(tokenSet.access_token);
  connection.tokenExpiresAt = tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : connection.tokenExpiresAt;
  connection.status = 'connected';
  connection.lastVerifiedAt = new Date();
  await connection.save();
  return tokenSet.access_token;
};

const getFreshAccessToken = async ({ owner }) => {
  const connection = await WorkspaceConnection.findOne({
    userId: owner,
    provider: PROVIDER,
    status: 'connected',
  }).select('+encryptedAccessToken +encryptedRefreshToken');
  if (!connection) fail('GOOGLE_WORKSPACE_REAUTH_REQUIRED');
  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 120000) {
    return { connection, accessToken: decryptToken(connection.encryptedAccessToken) };
  }
  return { connection, accessToken: await refreshAccessToken(connection) };
};

const google = async (accessToken, path, { method = 'GET', body, fetchImpl = fetch } = {}) => {
  const response = await fetchImpl(`https://${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) fail(`GOOGLE_WORKSPACE_HTTP_${response.status}`, 502);
  return response.json();
};

const findFolder = async (accessToken, name, parentId, fetchImpl) => {
  const escaped = String(name).replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const query = `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
  const url = `www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const result = await google(accessToken, url, { fetchImpl });
  return result.files?.[0] || null;
};

const createFolder = async (accessToken, name, parentId, fetchImpl) => google(accessToken, 'www.googleapis.com/drive/v3/files', {
  method: 'POST',
  body: {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {}),
  },
  fetchImpl,
});

const ensureFolder = async (accessToken, name, parentId, fetchImpl) => {
  const existing = await findFolder(accessToken, name, parentId, fetchImpl);
  return existing || createFolder(accessToken, name, parentId, fetchImpl);
};

const ensureDriveHierarchy = async ({ owner, accessToken, fetchImpl = fetch }) => {
  const root = await ensureFolder(accessToken, 'T.O.I. Souljah Academy', null, fetchImpl);
  const factory = await ensureFolder(accessToken, 'Content Factory', root.id, fetchImpl);
  const children = {};
  for (const name of ['Brand Assets', 'Freedom Audit', 'Organic', 'YouTube Long Form', 'Short Form', 'Archive']) {
    children[name] = await ensureFolder(accessToken, name, factory.id, fetchImpl);
  }
  const canonicalStorage = {
    provider: 'GOOGLE_DRIVE',
    rootFolderId: root.id,
    contentFactoryFolderId: factory.id,
    folders: Object.fromEntries(Object.entries(children).map(([name, folder]) => [name, folder.id])),
  };
  await WorkspaceConnection.updateOne(
    { userId: owner, provider: PROVIDER },
    { $set: { 'metadata.drive': { status: 'CONNECTED', lastVerifiedAt: new Date() }, 'metadata.canonicalStorage': canonicalStorage, lastVerifiedAt: new Date() } }
  );
  return canonicalStorage;
};

const handleCallback = async ({ code, state }) => {
  const stateRecord = await consumeOAuthState({ provider: PROVIDER, state });
  const tokenSet = await exchangeCode({ code, codeVerifier: stateRecord.codeVerifier });
  if (!tokenSet.access_token) fail('GOOGLE_WORKSPACE_TOKEN_MISSING', 400);
  const userInfo = await requestJson('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenSet.access_token}` },
  });
  const previous = await WorkspaceConnection.findOne({ userId: stateRecord.userId, provider: PROVIDER }).select('+encryptedRefreshToken');
  const refreshToken = tokenSet.refresh_token || (previous ? decryptToken(previous.encryptedRefreshToken) : '');
  if (!refreshToken) fail('GOOGLE_WORKSPACE_REFRESH_TOKEN_MISSING', 409);
  await WorkspaceConnection.findOneAndUpdate(
    { userId: stateRecord.userId, provider: PROVIDER },
    {
      userId: stateRecord.userId,
      provider: PROVIDER,
      accountEmail: userInfo.email || '',
      scopes: SCOPES,
      encryptedAccessToken: encryptToken(tokenSet.access_token),
      encryptedRefreshToken: encryptToken(refreshToken),
      tokenExpiresAt: tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : null,
      status: 'connected',
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ensureDriveHierarchy({ owner: stateRecord.userId, accessToken: tokenSet.access_token });
  return { accountEmail: userInfo.email || '', owner: String(stateRecord.userId) };
};

const getStatus = async ({ owner, verify = false }) => {
  let connection = await WorkspaceConnection.findOne({ userId: owner, provider: PROVIDER });
  if (!connection) return safeConnection(null, 'MISSING');
  if (!verify) return safeConnection(connection, connection.status === 'connected' ? 'UNKNOWN' : 'BLOCKED');
  try {
    const fresh = await WorkspaceConnection.findOne({ userId: owner, provider: PROVIDER }).select('+encryptedAccessToken +encryptedRefreshToken');
    const accessToken = await refreshAccessToken(fresh);
    const canonicalStorage = await ensureDriveHierarchy({ owner, accessToken });
    connection = await WorkspaceConnection.findOne({ userId: owner, provider: PROVIDER });
    return { ...safeConnection(connection, 'HEALTHY'), canonicalStorage };
  } catch (error) {
    const diagnostic = workspaceError(error);
    await WorkspaceConnection.updateOne(
      { userId: owner, provider: PROVIDER },
      { $set: { status: 'reauth_required', 'metadata.lastVerificationError': diagnostic } }
    );
    return {
      ...safeConnection(connection, 'BLOCKED'),
      status: 'reauth_required',
      error: diagnostic.code,
      errorStatusCode: diagnostic.statusCode,
      providerError: diagnostic.providerError,
      providerStatus: diagnostic.providerStatus,
    };
  }
};

const listAssetLibrary = async ({ owner }) => {
  const states = await require('mongoose').connection.db.collection('enterprisestates')
    .find({ owner, kind: 'C0_PREMIUM_ASSET' })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(100)
    .toArray();
  return states.map((doc) => doc.asset);
};

module.exports = {
  PROVIDER,
  SCOPES,
  commanderReturnUrl,
  beginAuthorization,
  handleCallback,
  getFreshAccessToken,
  getStatus,
  ensureDriveHierarchy,
  listAssetLibrary,
};
