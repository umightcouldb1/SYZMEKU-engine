'use strict';
const crypto = require('node:crypto');
const { hash } = require('./qa');
const KIND = 'C0_DRIVE_DRAFT_POINTER';
const MAX_BYTES = 4 * 1024 * 1024;
const API = 'https://www.googleapis.com/drive/v3/files/';
const FIELDS = 'id,mimeType,trashed,parents,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canEdit),appProperties,size,sha256Checksum';
const fail = (code, statusCode = 409) => { const e = new Error(code); e.statusCode = statusCode; throw e; };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id);
const validItemId = id => typeof id === 'string' && /^[a-zA-Z0-9_:-]{1,160}$/.test(id);
const pointerKey = (owner, id) => `c0:drive-draft:${owner}:${id}`;

// All content lives in immutable Drive blobs. Mongo contains only a pointer and a
// CAS operation lock. A crashed writer leaves a lock requiring explicit recovery;
// it is NEVER stolen on a timer. Unreferenced upload files are retained in Drive,
// not silently deleted. No request retries an ambiguous upload or Mongo commit.
function createStore({ db, owner, workspace, fetchImpl = fetch }) {
  if (!validId(owner)) fail('INVALID_DRAFT_OWNER', 400);
  const states = db.collection('enterprisestates');
  const identity = id => ({ _id: pointerKey(owner, id), owner, kind: KIND, itemId: id });
  async function request(url, token, options = {}, limit = MAX_BYTES) {
    try {
      const response = await fetchImpl(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (!response.ok) fail('DRIVE_DRAFT_REQUEST_FAILED', 502);
      if (Number(response.headers.get('content-length')) > limit) fail('DRIVE_DRAFT_TOO_LARGE', 413);
      if (!response.body?.getReader) fail('DRIVE_DRAFT_RESPONSE_INVALID', 502);
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); fail('DRIVE_DRAFT_TOO_LARGE', 413); } chunks.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
      return Buffer.concat(chunks);
    } catch (e) {
      if (/^DRIVE_DRAFT_/.test(e.message) && e.statusCode) throw e;
      fail('DRIVE_DRAFT_REQUEST_FAILED', 502);
    }
  }
  async function jsonRequest(url, token, options) {
    const bytes = await request(url, token, options, 128 * 1024);
    try { return JSON.parse(bytes.toString('utf8')); } catch { fail('DRIVE_DRAFT_RESPONSE_INVALID', 502); }
  }
  function assertPrivate(meta, accountEmail, mimeType) {
    if (meta.trashed !== false || meta.mimeType !== mimeType || meta.owners?.length !== 1 || meta.owners[0].me !== true || meta.owners[0].emailAddress?.toLowerCase() !== accountEmail.toLowerCase() || !Array.isArray(meta.permissions) || !meta.permissions.length || meta.permissions.some(p => p.type !== 'user' || p.role !== 'owner' || p.emailAddress?.toLowerCase() !== accountEmail.toLowerCase()) || meta.capabilities?.canEdit !== true) fail('DRIVE_DRAFT_PRIVATE_OWNER_REQUIRED');
  }
  async function context() {
    let fresh;
    try { fresh = await (workspace || require('./workspaceConnection')).getFreshAccessToken({ owner }); } catch { fail('DRIVE_DRAFT_AUTH_REQUIRED'); }
    const { connection, accessToken } = fresh || {};
    if (!accessToken || String(connection?.userId) !== owner || !connection?.accountEmail || connection.status !== 'connected' || !connection.scopes?.includes('https://www.googleapis.com/auth/drive.file')) fail('DRIVE_DRAFT_AUTH_REQUIRED');
    if (connection.accountEmail.toLowerCase() !== 'umightcouldb1@toisouljahacademy.com') fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');
    const canonical = connection.metadata?.canonicalStorage;
    const folderId = canonical?.folders?.Organic, factoryId = canonical?.contentFactoryFolderId;
    if (canonical?.provider !== 'GOOGLE_DRIVE' || !validId(folderId) || !validId(factoryId)) fail('DRIVE_DRAFT_FOLDER_REQUIRED');
    const folder = await jsonRequest(`${API}${folderId}?fields=${encodeURIComponent(FIELDS)}`, accessToken);
    assertPrivate(folder, connection.accountEmail, 'application/vnd.google-apps.folder');
    if (folder.id !== folderId || !folder.parents?.includes(factoryId)) fail('DRIVE_DRAFT_FOLDER_REQUIRED');
    return { token: accessToken, folderId, email: connection.accountEmail };
  }
  function normalize(id, input) {
    let record, bytes;
    try { const { _drive, ...content } = input || {}; bytes = Buffer.from(JSON.stringify(content)); if (bytes.length > MAX_BYTES) fail('DRIVE_DRAFT_TOO_LARGE', 413); record = JSON.parse(bytes); } catch (e) { if (e.statusCode) throw e; fail('INVALID_DRAFT_RECORD', 400); }
    if (!record || record.owner !== owner || record.itemId !== id || !Number.isInteger(record.currentVersion) || record.currentVersion < 1 || !Array.isArray(record.versions) || !record.versions.length || record.versions.length > 100 || !['DRAFT','HOLD','REJECTED','FOUNDER_REVIEW','APPROVING','APPROVED'].includes(record.status)) fail('INVALID_DRAFT_RECORD', 400);
    if (new Set(record.versions.map(v => v.number)).size !== record.versions.length || record.versions.some(v => !Number.isInteger(v.number) || !v.package || v.hash !== hash(v.package))) fail('INVALID_DRAFT_RECORD', 400);
    const current = record.versions.find(v => v.number === record.currentVersion);
    if (!current) fail('INVALID_DRAFT_RECORD', 400);
    return { record, bytes, sha256: current.hash, contentSha256: digest(bytes) };
  }
  async function readPointer(pointer, ctx) {
    if (!validId(pointer.driveFileId) || !/^[a-f0-9]{64}$/.test(pointer.contentSha256 || '')) fail('DRIVE_DRAFT_POINTER_INVALID');
    const meta = await jsonRequest(`${API}${pointer.driveFileId}?fields=${encodeURIComponent(FIELDS)}`, ctx.token);
    assertPrivate(meta, ctx.email, 'application/json');
    const props = meta.appProperties;
    if (meta.id !== pointer.driveFileId || !meta.parents?.includes(ctx.folderId) || props?.kind !== KIND || props.owner !== owner || props.itemId !== pointer.itemId || props.contentSha256 !== pointer.contentSha256 || props.version !== String(pointer.currentVersion) || Number(meta.size) > MAX_BYTES) fail('DRIVE_DRAFT_METADATA_INVALID');
    const bytes = await request(`${API}${pointer.driveFileId}?alt=media`, ctx.token);
    if (digest(bytes) !== pointer.contentSha256 || (meta.sha256Checksum && meta.sha256Checksum !== pointer.contentSha256)) fail('DRIVE_DRAFT_CHECKSUM_MISMATCH');
    let raw; try { raw = JSON.parse(bytes.toString('utf8')); } catch { fail('DRIVE_DRAFT_RESPONSE_INVALID', 502); }
    const result = normalize(pointer.itemId, raw);
    if (result.sha256 !== pointer.sha256 || result.record.status !== pointer.status || result.record.currentVersion !== pointer.currentVersion) fail('DRIVE_DRAFT_POINTER_INVALID');
    return { ...result.record, _drive: { fileId: pointer.driveFileId, contentSha256: pointer.contentSha256, packageHash: pointer.sha256 } };
  }
  async function get(id) {
    if (!validItemId(id)) fail('INVALID_DRAFT_ID', 400);
    const pointer = await states.findOne(identity(id));
    if (!pointer?.driveFileId) return null;
    return readPointer(pointer, await context());
  }
  async function list() {
    const pointers = await states.find({ owner, kind: KIND, driveFileId: { $exists: true } }).sort({ updatedAt: -1, itemId: 1 }).limit(100).toArray();
    if (!pointers.length) return [];
    const ctx = await context(); const records = [];
    for (const pointer of pointers) records.push(await readPointer(pointer, ctx));
    return records;
  }
  async function save({ id, expectedHash, expectedContentSha256 = null, record }) {
    if (!validItemId(id)) fail('INVALID_DRAFT_ID', 400);
    if (expectedHash !== null && !/^[a-f0-9]{64}$/.test(expectedHash || '')) fail('EXACT_VERSION_REQUIRED', 400);
    if ((expectedHash === null && expectedContentSha256 !== null) || (expectedHash !== null && !/^[a-f0-9]{64}$/.test(expectedContentSha256 || ''))) fail('EXACT_REVISION_REQUIRED', 400);
    const next = normalize(id, record), filter = identity(id);
    const ctx = await context();
    if (expectedHash === null) {
      try { await states.updateOne(filter, { $setOnInsert: { ...filter, sha256: null, contentSha256: null } }, { upsert: true }); } catch (e) { if (e.code !== 11000) fail('DRIVE_DRAFT_POINTER_UNAVAILABLE', 503); }
    }
    const operationId = crypto.randomUUID();
    const acquired = await states.updateOne({ ...filter, sha256: expectedHash, contentSha256: expectedContentSha256, operationId: { $exists: false } }, { $set: { operationId } });
    if (acquired.modifiedCount !== 1) fail('CONTENT_VERSION_CHANGED');
    try {
      const previous = await states.findOne({ ...filter, operationId });
      if (previous?.driveFileId && previous.contentSha256 === next.contentSha256) return await readPointer(previous, ctx);
      const boundary = `draft_${crypto.randomUUID()}`;
      const metadata = { name: `${id}-${operationId}.json`, mimeType: 'application/json', parents: [ctx.folderId], appProperties: { kind: KIND, owner, itemId: id, version: String(record.currentVersion), contentSha256: next.contentSha256, operationId } };
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`), next.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const uploaded = await jsonRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', ctx.token, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      if (!validId(uploaded.id)) fail('DRIVE_DRAFT_RESPONSE_INVALID', 502);
      const pointer = { ...filter, driveFileId: uploaded.id, sha256: next.sha256, contentSha256: next.contentSha256, currentVersion: next.record.currentVersion, status: next.record.status, updatedAt: new Date() };
      await readPointer(pointer, ctx); // Verify bytes, ownership and privacy before pointer publication.
      const committed = await states.updateOne({ ...filter, operationId, sha256: expectedHash, contentSha256: expectedContentSha256 }, { $set: pointer, $unset: { operationId: '' } });
      if (committed.modifiedCount !== 1) fail('CONTENT_VERSION_CHANGED');
      return { ...next.record, _drive: { fileId: pointer.driveFileId, contentSha256: pointer.contentSha256, packageHash: pointer.sha256 } };
    } finally {
      // Unlock only our own operation. If this DB call fails, lock stays fail-closed.
      await states.updateOne({ ...filter, operationId }, { $unset: { operationId: '' } });
    }
  }
  return { list, get, save };
}
module.exports = { createStore, KIND, MAX_BYTES, pointerKey };
