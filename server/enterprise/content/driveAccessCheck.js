'use strict';
const crypto = require('node:crypto');
const { validId } = require('./driveMedia');
const { privateConfigStatus } = require('./privateConfig');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_LOGO_BYTES = 25 * 1024 * 1024;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,trashed,parents,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canEdit,canDownload),size,sha256Checksum,version';
const CHECKS = ['connection', 'scopes', 'canonicalConfiguration', 'token', 'businessIdentity', 'rootFolder', 'contentFactoryFolder', 'organicFolder', 'originalLogo'];
const MESSAGES = Object.freeze({
  GOOGLE_WORKSPACE_EMAIL_CONFIG_REQUIRED: 'The designated business email must be configured privately on the server before this check.',
  GOOGLE_WORKSPACE_EMAIL_CONFIG_INVALID: 'The server business-email configuration is invalid. No provider request was made.',
  GOOGLE_WORKSPACE_LOGO_CONFIG_REQUIRED: 'The exact original logo ID must be configured privately on the server before this check.',
  GOOGLE_WORKSPACE_LOGO_CONFIG_INVALID: 'The server original-logo configuration is invalid. No provider request was made.',
  OWNER_REQUIRED: 'An authenticated founder account is required.',
  CONNECTION_MISSING: 'No existing business Workspace connection was found.',
  CONNECTION_UNAVAILABLE: 'The existing Workspace connection could not be read. Try this check again later.',
  CONNECTION_REAUTH_REQUIRED: 'The existing business Workspace connection requires sign-in again. No sign-in was started.',
  CONNECTION_OWNER_MISMATCH: 'The Workspace connection does not belong to this founder account.',
  BUSINESS_ACCOUNT_MISMATCH: 'The existing connection must use the designated business Google account.',
  DRIVE_FILE_SCOPE_MISSING: 'The existing connection does not record the required drive.file permission.',
  PRESENTATIONS_SCOPE_MISSING: 'The existing connection does not record the required presentations permission.',
  CANONICAL_CONFIGURATION_REQUIRED: 'The existing canonical Drive folder IDs are missing or invalid. No folders were created or replaced.',
  CONNECTION_CHANGED: 'The connection or canonical folder configuration changed during this check. Run the check again.',
  TOKEN_REFRESH_UNAVAILABLE: 'The existing token could not be refreshed. Try this check again later.',
  BUSINESS_IDENTITY_UNVERIFIED: 'Google did not confirm the designated business account for this app token.',
  APP_ACCESS_FORBIDDEN: 'Google denied this app access to the configured resource.',
  APP_RESOURCE_NOT_FOUND: 'The configured resource was not found or is not accessible to this app.',
  SOURCE_APP_ACCESS_FORBIDDEN: 'Google denied this app access to the original logo. The exact source must be selected or opened for this app through a supported access flow; no such flow was started or verified here.',
  SOURCE_APP_ACCESS_NOT_FOUND: 'The original logo was not found or is not accessible to this app. Folder access alone does not grant source access. The exact source must be selected or opened for this app through a supported access flow; no such flow was started or verified here.',
  GOOGLE_READ_UNAVAILABLE: 'Google could not complete this read-only check. Try again later.',
  GOOGLE_RESPONSE_INVALID: 'Google returned an incomplete or invalid response.',
  PRIVATE_BUSINESS_OWNER_REQUIRED: 'The configured resource must be private and owned only by the designated business account.',
  FOLDER_IDENTITY_MISMATCH: 'The configured folder does not match its expected ID, name, or folder type.',
  FOLDER_PARENT_MISMATCH: 'The configured folder is not in its expected canonical parent.',
  FOLDER_EDIT_ACCESS_REQUIRED: 'The business account cannot edit the configured private folder.',
  SOURCE_IDENTITY_MISMATCH: 'The source does not match the exact original logo image.',
  SOURCE_DOWNLOAD_REQUIRED: 'Google did not confirm download access to the original logo.',
  SOURCE_SIZE_INVALID: 'The original logo has an invalid size or exceeds the 25 MiB source limit.',
  SOURCE_CHANGED: 'The original logo changed during verification. Run the check again.',
});

// Failures are made from a closed vocabulary. Never return/log provider bodies,
// thrown messages, tokens, signed URLs, actual other-account identities, or names.
function failure(code) { return Object.assign(new Error(code), { accessCheckCode: code }); }
function codeOf(error, fallback = 'GOOGLE_READ_UNAVAILABLE') {
  return Object.hasOwn(MESSAGES, error?.accessCheckCode) ? error.accessCheckCode : fallback;
}
function canonicalOf(connection) {
  const c = connection?.metadata?.canonicalStorage;
  return { provider: c?.provider, rootFolderId: c?.rootFolderId, contentFactoryFolderId: c?.contentFactoryFolderId, organicFolderId: c?.folders?.Organic };
}
function connectionCode(connection, owner, BUSINESS_ACCOUNT) {
  if (!connection) return 'CONNECTION_MISSING';
  if (String(connection.userId) !== String(owner)) return 'CONNECTION_OWNER_MISMATCH';
  if (connection.status !== 'connected') return 'CONNECTION_REAUTH_REQUIRED';
  if (typeof connection.accountEmail !== 'string' || connection.accountEmail.toLowerCase() !== BUSINESS_ACCOUNT) return 'BUSINESS_ACCOUNT_MISMATCH';
  return null;
}
function scopeCode(connection) {
  if (!Array.isArray(connection?.scopes) || !connection.scopes.includes(DRIVE_SCOPE)) return 'DRIVE_FILE_SCOPE_MISSING';
  return connection.scopes.includes(SLIDES_SCOPE) ? null : 'PRESENTATIONS_SCOPE_MISSING';
}
function privateOwner(meta, BUSINESS_ACCOUNT) {
  return meta?.trashed === false && Array.isArray(meta.owners) && meta.owners.length === 1 && meta.owners[0].me === true
    && meta.owners[0].emailAddress?.toLowerCase() === BUSINESS_ACCOUNT && Array.isArray(meta.permissions) && meta.permissions.length > 0
    && meta.permissions.every(p => p.type === 'user' && p.role === 'owner' && p.emailAddress?.toLowerCase() === BUSINESS_ACCOUNT);
}
async function readConnection(owner) {
  // No secret selection or writes. Token refresh remains in the existing helper.
  return require('../../models/WorkspaceConnection').findOne({ userId: owner, provider: 'google_workspace' })
    .select('userId accountEmail status scopes metadata.canonicalStorage').lean();
}

/** Explicit, transient diagnostic only. This never calls getStatus({verify:true}),
 * ensureDriveHierarchy, authorization, file listing, Drive writes, or permissions.
 * Existing encrypted token refresh is the sole permitted persistence side effect.
 * Route caller MUST enforce existing founder authorization and private/no-store.
 */
async function checkExistingDriveAccess({ owner, workspaceImpl, readConnectionImpl = readConnection, fetchImpl = fetch } = {}) {
  const report = {
    status: 'BLOCKED', ready: false, checkedAt: new Date().toISOString(), accountEmail: null,
    scopeEvidence: 'EXISTING_CONNECTION_RECORD', requiredScopes: [DRIVE_SCOPE, SLIDES_SCOPE],
    accessEvidence: 'THIS_APP_TOKEN_ONLY', scopeExpansionAttempted: false, driveWritesAttempted: false,
    productionReady: false, checks: CHECKS.map(id => ({ id, status: 'SKIPPED', code: 'PREREQUISITE_NOT_VERIFIED' })),
  };
  function mark(id, status, code, evidence = {}) {
    Object.assign(report.checks.find(check => check.id === id), { status, code, ...(MESSAGES[code] ? { message: MESSAGES[code] } : {}), ...evidence });
  }
  function blocked(id, code) { mark(id, 'FAIL', code); return report; }
  if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(owner)) return blocked('connection', 'OWNER_REQUIRED');
  const configured = privateConfigStatus();
  if (!configured.configured) return blocked('connection', configured.code);
  const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID } = configured.config;
  report.accountEmail = BUSINESS_ACCOUNT;
  let connection;
  try { connection = await readConnectionImpl(owner); } catch { return blocked('connection', 'CONNECTION_UNAVAILABLE'); }
  let code = connectionCode(connection, owner, BUSINESS_ACCOUNT);
  if (code) return blocked('connection', code);
  mark('connection', 'PASS', 'EXISTING_BUSINESS_CONNECTION');
  code = scopeCode(connection);
  if (code) return blocked('scopes', code);
  mark('scopes', 'PASS', 'REQUIRED_SCOPES_RECORDED');
  const canonical = canonicalOf(connection), ids = [canonical.rootFolderId, canonical.contentFactoryFolderId, canonical.organicFolderId];
  if (canonical.provider !== 'GOOGLE_DRIVE' || !ids.every(validId) || new Set(ids).size !== 3) return blocked('canonicalConfiguration', 'CANONICAL_CONFIGURATION_REQUIRED');
  mark('canonicalConfiguration', 'PASS', 'EXISTING_CANONICAL_IDS');
  let fresh;
  try { fresh = await (workspaceImpl || require('./workspaceConnection')).getFreshAccessToken({ owner }); }
  catch (error) {
    const revoked = error?.providerPayload?.error === 'invalid_grant' || error?.statusCode === 401 || error?.message === 'GOOGLE_WORKSPACE_REAUTH_REQUIRED';
    return blocked('token', revoked ? 'CONNECTION_REAUTH_REQUIRED' : 'TOKEN_REFRESH_UNAVAILABLE');
  }
  if (connectionCode(fresh?.connection, owner, BUSINESS_ACCOUNT) || scopeCode(fresh?.connection)
    || JSON.stringify(canonicalOf(fresh?.connection)) !== JSON.stringify(canonical)) return blocked('token', 'CONNECTION_CHANGED');
  const token = fresh?.accessToken;
  if (typeof token !== 'string' || !token) return blocked('token', 'CONNECTION_REAUTH_REQUIRED');
  mark('token', 'PASS', 'EXISTING_TOKEN_AVAILABLE');

  async function read(path, source = false) {
    let response;
    try {
      response = await fetchImpl(`https://www.googleapis.com/drive/v3/${path}`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(30000),
      });
    } catch { throw failure('GOOGLE_READ_UNAVAILABLE'); }
    if (!response?.ok) {
      const status = response?.status;
      // A source-only 403/404 is NOT evidence of a revoked OAuth grant.
      throw failure(status === 401 ? 'CONNECTION_REAUTH_REQUIRED'
        : status === 403 ? (source ? 'SOURCE_APP_ACCESS_FORBIDDEN' : 'APP_ACCESS_FORBIDDEN')
          : status === 404 ? (source ? 'SOURCE_APP_ACCESS_NOT_FOUND' : 'APP_RESOURCE_NOT_FOUND') : 'GOOGLE_READ_UNAVAILABLE');
    }
    return response;
  }
  async function consume(response, limit, onChunk, tooLargeCode) {
    if (Number(response.headers?.get('content-length')) > limit) throw failure(tooLargeCode);
    if (!response.body?.getReader) throw failure('GOOGLE_RESPONSE_INVALID');
    const reader = response.body.getReader(); let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel().catch(() => {}); throw failure(tooLargeCode); }
        onChunk(value);
      }
    } finally { reader.releaseLock(); }
    return size;
  }
  async function json(path, source = false) {
    const chunks = [];
    await consume(await read(path, source), MAX_METADATA_BYTES, chunk => chunks.push(Buffer.from(chunk)), 'GOOGLE_RESPONSE_INVALID');
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { throw failure('GOOGLE_RESPONSE_INVALID'); }
  }
  const metadata = (id, source = false) => json(`files/${id}?fields=${encodeURIComponent(FIELDS)}`, source);
  try {
    const about = await json('about?fields=user(emailAddress,me)');
    if (about?.user?.me !== true || about.user.emailAddress?.toLowerCase() !== BUSINESS_ACCOUNT) return blocked('businessIdentity', 'BUSINESS_IDENTITY_UNVERIFIED');
    mark('businessIdentity', 'PASS', 'APP_TOKEN_BUSINESS_IDENTITY_VERIFIED');
  } catch (error) { return blocked('businessIdentity', codeOf(error)); }

  for (const [id, fileId, name, parentId] of [
    ['rootFolder', canonical.rootFolderId, 'T.O.I. Souljah Academy', null],
    ['contentFactoryFolder', canonical.contentFactoryFolderId, 'Content Factory', canonical.rootFolderId],
    ['organicFolder', canonical.organicFolderId, 'Organic', canonical.contentFactoryFolderId],
  ]) {
    try {
      const meta = await metadata(fileId);
      if (meta.id !== fileId || meta.mimeType !== FOLDER_MIME || meta.name !== name) throw failure('FOLDER_IDENTITY_MISMATCH');
      if (!privateOwner(meta, BUSINESS_ACCOUNT)) throw failure('PRIVATE_BUSINESS_OWNER_REQUIRED');
      if (parentId && (!Array.isArray(meta.parents) || meta.parents.length !== 1 || meta.parents[0] !== parentId)) throw failure('FOLDER_PARENT_MISMATCH');
      if (meta.capabilities?.canEdit !== true) throw failure('FOLDER_EDIT_ACCESS_REQUIRED');
      mark(id, 'PASS', 'PRIVATE_CANONICAL_FOLDER_VERIFIED', { fileId });
    } catch (error) {
      const failureCode = codeOf(error); mark(id, 'FAIL', failureCode);
      if (failureCode === 'CONNECTION_REAUTH_REQUIRED') return report;
    }
  }

  try {
    const before = await metadata(ORIGINAL_LOGO_FILE_ID, true);
    const assertSource = meta => {
      if (meta.id !== ORIGINAL_LOGO_FILE_ID || typeof meta.mimeType !== 'string' || !/^image\/[a-z0-9.+-]+$/i.test(meta.mimeType)) throw failure('SOURCE_IDENTITY_MISMATCH');
      if (!privateOwner(meta, BUSINESS_ACCOUNT)) throw failure('PRIVATE_BUSINESS_OWNER_REQUIRED');
      if (meta.capabilities?.canDownload !== true) throw failure('SOURCE_DOWNLOAD_REQUIRED');
      if (!/^\d+$/.test(String(meta.size)) || !Number.isSafeInteger(Number(meta.size)) || Number(meta.size) < 1 || Number(meta.size) > MAX_LOGO_BYTES) throw failure('SOURCE_SIZE_INVALID');
      if (meta.sha256Checksum !== undefined && !/^[a-f0-9]{64}$/.test(meta.sha256Checksum)) throw failure('GOOGLE_RESPONSE_INVALID');
    };
    assertSource(before);
    // Always read the original bytes, even when Drive supplies a checksum. Merely
    // seeing its metadata or containing folder does not prove download access.
    const digest = crypto.createHash('sha256');
    const size = await consume(await read(`files/${ORIGINAL_LOGO_FILE_ID}?alt=media`, true), MAX_LOGO_BYTES, bytes => digest.update(bytes), 'SOURCE_SIZE_INVALID');
    const sha256 = digest.digest('hex');
    if (size !== Number(before.size) || (before.sha256Checksum && before.sha256Checksum !== sha256)) throw failure('SOURCE_CHANGED');
    const after = await metadata(ORIGINAL_LOGO_FILE_ID, true); assertSource(after);
    if (after.mimeType !== before.mimeType || after.size !== before.size || after.version !== before.version
      || after.sha256Checksum !== before.sha256Checksum || (after.sha256Checksum && after.sha256Checksum !== sha256)) throw failure('SOURCE_CHANGED');
    mark('originalLogo', 'PASS', 'EXACT_ORIGINAL_LOGO_READ_VERIFIED', { fileId: ORIGINAL_LOGO_FILE_ID, sha256, size, mimeType: before.mimeType });
  } catch (error) { mark('originalLogo', 'FAIL', codeOf(error)); }
  report.ready = report.checks.every(check => check.status === 'PASS');
  report.status = report.ready ? 'PASS' : 'BLOCKED';
  return report;
}

module.exports = { checkExistingDriveAccess, DRIVE_SCOPE, SLIDES_SCOPE, MAX_LOGO_BYTES };
