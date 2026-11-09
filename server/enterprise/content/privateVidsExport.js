'use strict';

const crypto = require('node:crypto');
const { validId } = require('./driveMedia');
const { readPrivateConfig } = require('./privateConfig');

const KIND = 'C0_PRIVATE_VIDS_EXPORT_V1';
const RECEIPT_KIND = 'C0_VIDS_SOURCE_VERSION_V1';
const VIDS_MIME = 'application/vnd.google-apps.vid';
const MP4_MIME = 'video/mp4';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,mimeType,version,modifiedTime,trashed,parents,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canEdit,canDownload),appProperties,size,sha256Checksum';
const MAX_JSON_BYTES = 256 * 1024;
// Match driveMedia.inspect's existing bounded founder-video-review limit.
const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const validKey = v => typeof v === 'string' && /^[a-zA-Z0-9_:-]{1,96}$/.test(v);
const sameEmail = (v, BUSINESS_ACCOUNT) => typeof v === 'string' && v.toLowerCase() === BUSINESS_ACCOUNT;
const digest = v => crypto.createHash('sha256').update(v).digest('hex');
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { statusCode }); };

// API contracts verified against Google's public documentation, 2026-11-07:
// https://developers.google.com/workspace/drive/api/reference/rest/v3/files/download
// https://developers.google.com/workspace/drive/api/guides/long-running-operations
// https://developers.google.com/workspace/drive/api/reference/rest/v3/operations/get
// https://developers.google.com/workspace/drive/api/guides/manage-uploads
// DownloadFileResponse uses downloadUri (NOT downloadURL/downloadUrl). Native
// Vids has no downloadable pinned revision or source-byte checksum. This receipt
// binds the observed monotonically increasing Drive version to the approved
// package/job; it does NOT prove the Vids timeline matches that package.
function receiptFor(args, meta) {
  if (!/^[1-9][0-9]{0,19}$/.test(meta.version || '') ||
      typeof meta.modifiedTime !== 'string' || !Number.isFinite(Date.parse(meta.modifiedTime))) fail('GOOGLE_VIDS_SOURCE_VERSION_REQUIRED');
  const receipt = { kind: RECEIPT_KIND, owner: args.owner, itemId: args.itemId,
    operationId: args.operationId, sourceHash: args.expectedHash, fileId: args.vidsFileId,
    version: meta.version, modifiedTime: meta.modifiedTime };
  return { ...receipt, receiptHash: digest(JSON.stringify(receipt)) };
}

function operationPath(name) {
  if (typeof name !== 'string' || !/^(?:operations\/)?[a-zA-Z0-9_~=-][a-zA-Z0-9._~=-]{0,511}$/.test(name)) fail('GOOGLE_VIDS_OPERATION_NAME_INVALID', 400);
  // Drive's REST mapping is operations/{name}, unlike APIs using {name=operations/*}.
  // Treat the returned name as opaque; do not strip a prefix or rewrite it.
  return `${DRIVE}/operations/${encodeURIComponent(name)}`;
}

function safeUrl(value, upload = false) {
  let u;
  try {
    if (typeof value !== 'string' || value.length > 16384 || /[\s\\]/.test(value)) throw new Error();
    u = new URL(value);
  } catch { fail(upload ? 'GOOGLE_VIDS_UPLOAD_URI_INVALID' : 'GOOGLE_VIDS_DOWNLOAD_URI_INVALID', 502); }
  // Only a service-issued URI reaches this function. Google's documented Drive
  // hosts, not arbitrary caller URLs: https://knowledge.workspace.google.com/
  // admin/drive/drive-and-sites-firewall-and-proxy-settings . This intentionally
  // narrower allowlist fails closed for an undocumented/new delivery host.
  const host = u.hostname;
  const allowed = host === 'www.googleapis.com' ||
    ['drive.usercontent.google.com', 'drive-data-export.usercontent.google.com', 'drive-data-export-eu.usercontent.google.com'].includes(host) ||
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(host);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443') || !allowed ||
      (upload && (u.origin !== 'https://www.googleapis.com' || u.pathname !== '/upload/drive/v3/files' ||
        u.searchParams.get('uploadType') !== 'resumable' || !u.searchParams.get('upload_id')))) {
    fail(upload ? 'GOOGLE_VIDS_UPLOAD_URI_INVALID' : 'GOOGLE_VIDS_DOWNLOAD_URI_INVALID', 502);
  }
  return u;
}

function assertPrivate(meta, mimeType, editable, BUSINESS_ACCOUNT) {
  if (meta?.trashed !== false || meta.mimeType !== mimeType || meta.owners?.length !== 1 ||
      meta.owners[0].me !== true || !sameEmail(meta.owners[0].emailAddress, BUSINESS_ACCOUNT) ||
      !Array.isArray(meta.permissions) || !meta.permissions.length ||
      meta.permissions.some(p => p.type !== 'user' || p.role !== 'owner' || !sameEmail(p.emailAddress, BUSINESS_ACCOUNT)) ||
      (editable && meta.capabilities?.canEdit !== true)) fail('GOOGLE_VIDS_PRIVATE_OWNER_REQUIRED');
}

async function cancel(response) { try { await response?.body?.cancel(); } catch {} }
async function readJson(response) {
  if (!response.body?.getReader) fail('GOOGLE_VIDS_RESPONSE_INVALID', 502);
  if (Number(response.headers.get('content-length')) > MAX_JSON_BYTES) { await cancel(response); fail('GOOGLE_VIDS_RESPONSE_TOO_LARGE', 413); }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) fail('GOOGLE_VIDS_RESPONSE_TOO_LARGE', 413);
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('GOOGLE_VIDS_RESPONSE_INVALID', 502); }
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
}

async function context(args) {
  const { owner, itemId, operationId, vidsFileId, expectedHash, workspaceImpl, fetchImpl = fetch } = args;
  if (![owner, itemId, operationId].every(validKey) || !validId(vidsFileId) || !SHA256.test(expectedHash || '')) fail('GOOGLE_VIDS_OPERATION_INVALID', 400);
  const { BUSINESS_ACCOUNT } = readPrivateConfig();
  let fresh;
  try { fresh = await (workspaceImpl || require('./workspaceConnection')).getFreshAccessToken({ owner }); }
  catch { fail('GOOGLE_VIDS_AUTH_REQUIRED'); }
  const { connection, accessToken } = fresh || {};
  if (String(connection?.userId) !== owner || connection?.status !== 'connected' || !accessToken ||
      !connection.scopes?.includes('https://www.googleapis.com/auth/drive.file')) fail('GOOGLE_VIDS_AUTH_REQUIRED');
  if (!sameEmail(connection.accountEmail, BUSINESS_ACCOUNT)) fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');
  const canonical = connection.metadata?.canonicalStorage;
  const folderId = canonical?.folders?.Organic, factoryId = canonical?.contentFactoryFolderId;
  if (canonical?.provider !== 'GOOGLE_DRIVE' || !validId(folderId) || !validId(factoryId)) fail('GOOGLE_VIDS_FOLDER_REQUIRED');
  const deadline = AbortSignal.timeout(30 * 60 * 1000);
  async function request(url, options = {}, auth = true) {
    let response;
    try { response = await fetchImpl(url, { ...options, headers: { ...options.headers, ...(auth ? { Authorization: `Bearer ${accessToken}` } : {}) },
      redirect: 'manual', signal: AbortSignal.any([deadline, AbortSignal.timeout(120000)]) }); }
    catch { fail('GOOGLE_VIDS_REQUEST_FAILED', 502); }
    // A malicious/custom fetch must not silently follow a redirect either.
    if (response.redirected) { await cancel(response); fail('GOOGLE_VIDS_REDIRECT_REJECTED', 502); }
    return response;
  }
  async function json(url, options) {
    const response = await request(url, options);
    if (!response.ok) { await cancel(response); fail(`GOOGLE_VIDS_HTTP_${response.status}`, 502); }
    return readJson(response);
  }
  const metadata = id => json(`${DRIVE}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`);
  async function folder() {
    const meta = await metadata(folderId);
    assertPrivate(meta, 'application/vnd.google-apps.folder', true, BUSINESS_ACCOUNT);
    if (meta.id !== folderId || meta.name !== 'Organic' || meta.parents?.length !== 1 || meta.parents[0] !== factoryId) fail('GOOGLE_VIDS_FOLDER_REQUIRED');
  }
  async function source() {
    const meta = await metadata(vidsFileId); assertPrivate(meta, VIDS_MIME, false, BUSINESS_ACCOUNT);
    if (meta.id !== vidsFileId || meta.capabilities?.canDownload !== true) fail('GOOGLE_VIDS_SOURCE_REQUIRED');
    return receiptFor(args, meta);
  }
  await folder();
  const about = await json(`${DRIVE}/about?fields=${encodeURIComponent('user(emailAddress,me)')}`);
  if (!sameEmail(about.user?.emailAddress, BUSINESS_ACCOUNT) || about.user.me !== true) fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');
  return { folderId, folder, source, request, json, metadata, BUSINESS_ACCOUNT };
}

// Read-only preflight. Persist this receipt inside the canonical Drive job BEFORE
// permitting any operation start/upload. Never trust a receipt from an HTTP body;
// the orchestrator must load it from its owner-scoped durable job.
async function inspectPrivateVids(args) {
  args = { ...args };
  try { const ctx = await context(args); return await ctx.source(); }
  catch (e) { throw safeError(e); }
}

function safeError(e) {
  // Do not propagate fetch URLs, response bodies, resource keys or signed upload
  // and download URIs through logs/errors. No error cause is retained.
  return Object.assign(new Error(/^GOOGLE_(VIDS|WORKSPACE)_[A-Z0-9_]+$/.test(e?.message || '') ? e.message : 'GOOGLE_VIDS_REQUEST_FAILED'),
    { statusCode: Number.isInteger(e?.statusCode) ? e.statusCode : 502 });
}

function contentLength(response) {
  const value = response.headers.get('content-length');
  if (!value || !/^[1-9][0-9]*$/.test(value)) fail('GOOGLE_VIDS_DOWNLOAD_LENGTH_REQUIRED', 502);
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size > MAX_EXPORT_BYTES) fail('GOOGLE_VIDS_EXPORT_TOO_LARGE', 413);
  if ((response.headers.get('content-encoding') || 'identity') !== 'identity') fail('GOOGLE_VIDS_DOWNLOAD_ENCODING_INVALID', 502);
  if (!response.body?.getReader) fail('GOOGLE_VIDS_RESPONSE_INVALID', 502);
  return size;
}

// This is container sniffing only, not proof of playable video/audio or fidelity.
function assertMp4(prefix) {
  if (prefix.length < 16 || prefix.toString('ascii', 4, 8) !== 'ftyp' || prefix.readUInt32BE(0) < 16) fail('GOOGLE_VIDS_MP4_REQUIRED', 502);
}

async function* chunksOf(response, expectedSize) {
  const reader = response.body.getReader(); let buffer = Buffer.alloc(UPLOAD_CHUNK_BYTES), used = 0, size = 0, first = true;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > expectedSize || size > MAX_EXPORT_BYTES) fail('GOOGLE_VIDS_DOWNLOAD_SIZE_MISMATCH', 502);
      let offset = 0;
      while (offset < value.byteLength) {
        const n = Math.min(buffer.length - used, value.byteLength - offset);
        buffer.set(value.subarray(offset, offset + n), used); used += n; offset += n;
        if (used === buffer.length) {
          if (first) { assertMp4(buffer); first = false; }
          yield buffer; buffer = Buffer.alloc(UPLOAD_CHUNK_BYTES); used = 0;
        }
      }
    }
    if (size !== expectedSize) fail('GOOGLE_VIDS_DOWNLOAD_SIZE_MISMATCH', 502);
    if (used) { if (first) assertMp4(buffer.subarray(0, used)); yield buffer.subarray(0, used); }
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
}

/**
 * The caller holds a durable CAS job/attempt lock in Drive before this call.
 * allowCreate:true grants ONE invocation permission to start and/or transfer.
 * After crashes or uncertain responses, reconcile with allowCreate:false only.
 * A known pending result (uploadAttempted:false) permits a later locked polling
 * invocation. operationName and sourceReceipt must come from that same job.
 * No name + allowCreate:false can only reconcile; it NEVER restarts an operation.
 * reconcileOnly:true performs artifact lookup only, even with a known name.
 * Name + allowCreate:false polls once or verifies an existing artifact, without
 * writes. A completed read-only poll returns READY_TO_TRANSFER; the service may
 * expire that completed operation, so use a locked writable poll when ready.
 * No automatic retries, polling loop, upload-session replay, sharing, deletion,
 * disk staging, approval, scheduling, paid generation, or publication.
 */
async function exportPrivateVids(args) {
  args = { ...args, ...(args?.sourceReceipt ? { sourceReceipt: { ...args.sourceReceipt } } : {}) };
  let startAttempted = false, uploadAttempted = false, outputId, name = args?.operationName;
  let sourceReceipt;
  try {
    if (typeof (args?.allowCreate === undefined ? false : args.allowCreate) !== 'boolean') fail('GOOGLE_VIDS_OPERATION_INVALID', 400);
    if (typeof (args.reconcileOnly === undefined ? false : args.reconcileOnly) !== 'boolean') fail('GOOGLE_VIDS_OPERATION_INVALID', 400);
    if (args.reconcileOnly && args.allowCreate) fail('GOOGLE_VIDS_OPERATION_INVALID', 400);
    if (name !== undefined) operationPath(name);
    const ctx = await context(args);
    sourceReceipt = await ctx.source();
    if (!args.sourceReceipt || Object.keys(sourceReceipt).some(k => args.sourceReceipt[k] !== sourceReceipt[k])) fail('GOOGLE_VIDS_SOURCE_CHANGED');
    const verifySource = async () => {
      if ((await ctx.source()).receiptHash !== sourceReceipt.receiptHash) fail('GOOGLE_VIDS_SOURCE_CHANGED');
    };
    const properties = { kind: KIND, owner: args.owner, itemId: args.itemId, operationId: args.operationId,
      sourceHash: args.expectedHash, sourceFileId: args.vidsFileId, sourceVersion: sourceReceipt.version, sourceReceiptHash: sourceReceipt.receiptHash };
    if (Object.entries(properties).some(([key, value]) => Buffer.byteLength(key + value) > 124)) fail('GOOGLE_VIDS_OPERATION_INVALID', 400);
    const query = `trashed=false and appProperties has { key='kind' and value='${KIND}' } and appProperties has { key='operationId' and value='${args.operationId}' }`;
    const lookup = await ctx.json(`${DRIVE}/files?q=${encodeURIComponent(query)}&pageSize=100&fields=${encodeURIComponent(`files(${FILE_FIELDS}),nextPageToken,incompleteSearch`)}`);
    if (!Array.isArray(lookup.files) || lookup.nextPageToken || lookup.incompleteSearch || lookup.files.length > 1) fail('GOOGLE_VIDS_OPERATION_AMBIGUOUS');
    const base = () => ({ operationId: args.operationId, ...(name ? { operationName: name } : {}), sourceHash: args.expectedHash,
      sourceReceipt, storage: 'GOOGLE_DRIVE', approval: 'FOUNDER_REVIEW_REQUIRED', videoApproval: false,
      visualQA: 'PENDING', audioQA: 'PENDING', lineage: 'SOURCE_VERSION_BOUND; TIMELINE_REVIEW_REQUIRED', startAttempted, uploadAttempted });
    function verifyOutput(meta, expectedSha, expectedSize) {
      assertPrivate(meta, MP4_MIME, true, ctx.BUSINESS_ACCOUNT);
      if (!validId(meta.id) || meta.id !== outputId || meta.parents?.length !== 1 || meta.parents[0] !== ctx.folderId ||
          Object.entries(properties).some(([key, value]) => meta.appProperties?.[key] !== value) ||
          !SHA256.test(meta.appProperties?.downloadOperationHash || '') ||
          (name && meta.appProperties.downloadOperationHash !== digest(name)) || !SHA256.test(meta.sha256Checksum || '') ||
          (expectedSha && meta.sha256Checksum !== expectedSha) || !/^[1-9][0-9]*$/.test(meta.size || '') ||
          Number(meta.size) > MAX_EXPORT_BYTES || (expectedSize !== undefined && Number(meta.size) !== expectedSize)) fail('GOOGLE_VIDS_OUTPUT_MISMATCH');
    }
    if (lookup.files.length) {
      outputId = lookup.files[0]?.id; verifyOutput(lookup.files[0]);
      const before = await ctx.metadata(outputId); verifyOutput(before);
      const response = await ctx.request(`${DRIVE}/files/${outputId}?alt=media`);
      if (!response.ok) { await cancel(response); fail(`GOOGLE_VIDS_HTTP_${response.status}`, 502); }
      let size;
      try { size = contentLength(response); } catch (e) { await cancel(response); throw e; }
      if (size !== Number(before.size)) { await cancel(response); fail('GOOGLE_VIDS_OUTPUT_MISMATCH'); }
      const sha = crypto.createHash('sha256');
      for await (const chunk of chunksOf(response, size)) sha.update(chunk);
      const sha256 = sha.digest('hex');
      const after = await ctx.metadata(outputId); verifyOutput(after, sha256, size);
      if (!before.version || before.version !== after.version) fail('GOOGLE_VIDS_OUTPUT_CHANGED');
      await verifySource(); await ctx.folder();
      return { ...base(), status: 'VIDEO_DRAFT_SAVED', fileId: outputId, url: `https://drive.google.com/file/d/${outputId}/view`,
        mimeType: MP4_MIME, size, sha256, integrity: 'SHA256_VERIFIED', reconciled: true };
    }
    if (args.reconcileOnly || (!name && args.allowCreate !== true)) fail('GOOGLE_VIDS_OUTCOME_UNCERTAIN');
    let operation;
    if (!name) {
      await verifySource();
      startAttempted = true;
      operation = await ctx.json(`${DRIVE}/files/${args.vidsFileId}/download?mimeType=video%2Fmp4`, { method: 'POST', headers: { 'Content-Length': '0' } });
      operationPath(operation?.name); name = operation.name;
    } else operation = await ctx.json(operationPath(name));
    if (operation?.name !== name || (operation.done != null && typeof operation.done !== 'boolean') ||
        (operation.error && operation.response)) fail('GOOGLE_VIDS_OPERATION_INVALID', 502);
    await verifySource();
    if (operation.done !== true) {
      if (operation.error || operation.response) fail('GOOGLE_VIDS_OPERATION_INVALID', 502);
      return { ...base(), status: 'GOOGLE_VIDS_EXPORT_PENDING', retryAfterSeconds: 10, reconciled: false };
    }
    if (operation.error) fail('GOOGLE_VIDS_OPERATION_FAILED', 502);
    if (operation.response?.['@type'] !== 'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse') fail('GOOGLE_VIDS_OPERATION_INVALID', 502);
    let uri = safeUrl(operation.response.downloadUri);
    // Do not return/persist the operation object or the capability-bearing URI.
    if (args.allowCreate !== true) return { ...base(), status: 'GOOGLE_VIDS_READY_TO_TRANSFER', reconciled: false };
    let download;
    for (let redirects = 0; redirects <= 3; redirects++) {
      download = await ctx.request(uri.href, { headers: { Accept: MP4_MIME, 'Accept-Encoding': 'identity' } }, uri.origin === 'https://www.googleapis.com');
      if ([301, 302, 303, 307, 308].includes(download.status)) {
        const location = download.headers.get('location'); await cancel(download);
        if (redirects === 3 || !location) fail('GOOGLE_VIDS_REDIRECT_REJECTED', 502);
        let target; try { target = new URL(location, uri).href; } catch { fail('GOOGLE_VIDS_DOWNLOAD_URI_INVALID', 502); }
        uri = safeUrl(target); continue;
      }
      break;
    }
    if (!download.ok || download.status !== 200) { await cancel(download); fail('GOOGLE_VIDS_DOWNLOAD_FAILED', 502); }
    let size;
    try {
      size = contentLength(download);
      if (!['video/mp4', 'application/octet-stream'].includes((download.headers.get('content-type') || '').split(';')[0].trim().toLowerCase())) fail('GOOGLE_VIDS_MP4_REQUIRED', 502);
    } catch (e) { await cancel(download); throw e; }
    const iterator = chunksOf(download, size)[Symbol.asyncIterator]();
    try {
      let current = await iterator.next();
      if (current.done) fail('GOOGLE_VIDS_MP4_REQUIRED', 502);
      await verifySource(); await ctx.folder();
      const metadata = { name: `DRAFT - ${args.itemId} - video.mp4`, mimeType: MP4_MIME, parents: [ctx.folderId],
        appProperties: { ...properties, downloadOperationHash: digest(name) } };
      uploadAttempted = true;
      const init = await ctx.request(`${UPLOAD}?uploadType=resumable&fields=id`, { method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': MP4_MIME, 'X-Upload-Content-Length': String(size) }, body: JSON.stringify(metadata) });
      if (!init.ok) { await cancel(init); fail('GOOGLE_VIDS_UPLOAD_FAILED', 502); }
      const session = safeUrl(init.headers.get('location'), true); await cancel(init);
      const sha = crypto.createHash('sha256'); let offset = 0;
      while (!current.done) {
        // One chunk of lookahead proves EOF/length before the final PUT. Memory
        // remains bounded by two upload chunks plus the fetch reader's chunk.
        const next = await iterator.next();
        if (next.done) { await verifySource(); await ctx.folder(); }
        const chunk = current.value; sha.update(chunk);
        const end = offset + chunk.length;
        const response = await ctx.request(session.href, { method: 'PUT', headers: { 'Content-Type': MP4_MIME,
          'Content-Length': String(chunk.length), 'Content-Range': `bytes ${offset}-${end - 1}/${size}` }, body: chunk });
        if (!next.done) {
          const range = response.headers.get('range'); await cancel(response);
          if (response.status !== 308 || range !== `bytes=0-${end - 1}`) fail('GOOGLE_VIDS_UPLOAD_OUTCOME_UNCERTAIN', 502);
        } else {
          if (![200, 201].includes(response.status)) { await cancel(response); fail('GOOGLE_VIDS_UPLOAD_OUTCOME_UNCERTAIN', 502); }
          const uploaded = await readJson(response);
          if (!validId(uploaded?.id)) fail('GOOGLE_VIDS_RESPONSE_INVALID', 502);
          outputId = uploaded.id;
        }
        offset = end; current = next;
      }
      const sha256 = sha.digest('hex');
      await verifySource(); await ctx.folder();
      verifyOutput(await ctx.metadata(outputId), sha256, size);
      return { ...base(), status: 'VIDEO_DRAFT_SAVED', fileId: outputId, url: `https://drive.google.com/file/d/${outputId}/view`,
        mimeType: MP4_MIME, size, sha256, integrity: 'SHA256_VERIFIED', reconciled: false };
    } finally { try { await iterator.return(); } catch {} }
  } catch (e) {
    const error = safeError(e);
    Object.assign(error, { startAttempted, uploadAttempted, outcomeUnknown: startAttempted || uploadAttempted || !!outputId || args?.allowCreate !== true });
    if (validKey(args?.operationId)) error.operationId = args.operationId;
    if (name) { try { operationPath(name); error.operationName = name; } catch {} }
    if (validId(outputId)) error.fileId = outputId;
    if (sourceReceipt) error.sourceReceipt = sourceReceipt;
    throw error;
  }
}

module.exports = { inspectPrivateVids, exportPrivateVids, KIND, RECEIPT_KIND, VIDS_MIME, MP4_MIME, MAX_EXPORT_BYTES, UPLOAD_CHUNK_BYTES };
