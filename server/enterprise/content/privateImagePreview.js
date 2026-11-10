'use strict';

const crypto = require('node:crypto');
const { validId } = require('./driveMedia');
const { readPrivateConfig } = require('./privateConfig');

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SHA256 = /^[a-f0-9]{64}$/;
const FIELDS = 'id,mimeType,size,sha256Checksum,version,trashed,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canDownload)';
const failure = (code, statusCode = 409) => Object.assign(new Error(code), { statusCode });

function assertMetadata(meta, fileId, BUSINESS_ACCOUNT) {
  if (!meta || meta.id !== fileId || !IMAGE_TYPES.has(meta.mimeType)) throw failure('PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED', 400);
  if (meta.trashed !== false || !Array.isArray(meta.owners) || meta.owners.length !== 1
    || meta.owners[0]?.me !== true || meta.owners[0]?.emailAddress?.toLowerCase() !== BUSINESS_ACCOUNT
    || !Array.isArray(meta.permissions) || !meta.permissions.length
    || meta.permissions.some(p => p?.type !== 'user' || p.role !== 'owner' || p.emailAddress?.toLowerCase() !== BUSINESS_ACCOUNT)) {
    throw failure('GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED');
  }
  if (meta.capabilities?.canDownload !== true) throw failure('GOOGLE_DRIVE_MEDIA_READ_REQUIRED');
  if (!/^\d+$/.test(String(meta.size)) || !Number.isSafeInteger(Number(meta.size))
    || Number(meta.size) < 1 || Number(meta.size) > MAX_IMAGE_BYTES) throw failure('PRIVATE_IMAGE_PREVIEW_SIZE_INVALID', 400);
  if (typeof meta.version !== 'string' || !/^\d+$/.test(meta.version)
    || (meta.sha256Checksum !== undefined && !SHA256.test(meta.sha256Checksum))) throw failure('PRIVATE_IMAGE_PREVIEW_METADATA_INVALID');
}

// A small signature check rejects mislabeled active formats. This does not decode,
// crop, resize, recompress, recolor, or otherwise change the original image bytes.
function hasRasterSignature(buffer, mimeType) {
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  return mimeType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) + 8 === buffer.length;
}

async function boundedBytes(response, limit, tooLargeCode) {
  const declared = response.headers?.get('content-length');
  if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel?.().catch(() => {});
    throw failure(tooLargeCode, 400);
  }
  if (!response.body?.getReader) throw failure('PRIVATE_IMAGE_PREVIEW_UNAVAILABLE', 502);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw failure(tooLargeCode, 400);
      chunks.push(Buffer.from(value));
    }
    if (declared !== null && declared !== undefined && Number(declared) !== size) throw failure('PRIVATE_IMAGE_PREVIEW_CHANGED');
    return Buffer.concat(chunks, size);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error.statusCode) throw error;
    throw failure('PRIVATE_IMAGE_PREVIEW_UNAVAILABLE', 502);
  } finally { reader.releaseLock(); }
}

/** Read only the requested private image into bounded, transient memory.
 * The caller supplies an authenticated founder owner, never a browser owner ID.
 * Existing token refresh is the only persistence side effect. No disk, image
 * transformations, public URLs, Drive writes, or authorization expansion.
 */
async function readExactPrivateImage({ owner, fileId, sha256, workspaceImpl, fetchImpl = fetch, signal } = {}) {
  if (typeof owner !== 'string' || !/^[a-f0-9]{24}$/.test(owner)) throw failure('PRIVATE_IMAGE_PREVIEW_OWNER_REQUIRED', 403);
  if (!validId(fileId) || typeof sha256 !== 'string' || !SHA256.test(sha256)) throw failure('PRIVATE_IMAGE_PREVIEW_SNAPSHOT_REQUIRED', 400);
  const { BUSINESS_ACCOUNT } = readPrivateConfig();
  let fresh;
  try { fresh = await (workspaceImpl || require('./workspaceConnection')).getFreshAccessToken({ owner }); }
  catch { throw failure('DRIVE_DRAFT_AUTH_REQUIRED'); }
  const { connection, accessToken } = fresh || {};
  if (typeof accessToken !== 'string' || !accessToken || String(connection?.userId) !== owner
    || connection?.status !== 'connected' || !Array.isArray(connection.scopes)
    || !connection.scopes.includes('https://www.googleapis.com/auth/drive.file')) throw failure('DRIVE_DRAFT_AUTH_REQUIRED');
  if (connection.accountEmail?.toLowerCase() !== BUSINESS_ACCOUNT) throw failure('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');

  async function request(path, accept) {
    let response;
    try {
      response = await fetchImpl(`https://www.googleapis.com/drive/v3/${path}`, {
        method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: accept },
        redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      });
    } catch { throw failure('PRIVATE_IMAGE_PREVIEW_UNAVAILABLE', 502); }
    if (!response?.ok) {
      await response?.body?.cancel?.().catch(() => {});
      throw failure(response?.status === 401 ? 'DRIVE_DRAFT_AUTH_REQUIRED'
        : [403, 404].includes(response?.status) ? 'GOOGLE_DRIVE_MEDIA_READ_REQUIRED' : 'PRIVATE_IMAGE_PREVIEW_UNAVAILABLE', response?.status === 401 ? 401 : 409);
    }
    return response;
  }
  async function metadata() {
    const buffer = await boundedBytes(await request(`files/${fileId}?fields=${encodeURIComponent(FIELDS)}`, 'application/json'), MAX_METADATA_BYTES, 'PRIVATE_IMAGE_PREVIEW_METADATA_INVALID');
    let meta;
    try { meta = JSON.parse(buffer.toString('utf8')); } catch { throw failure('PRIVATE_IMAGE_PREVIEW_METADATA_INVALID'); }
    assertMetadata(meta, fileId, BUSINESS_ACCOUNT);
    return meta;
  }
  const before = await metadata();
  if (before.sha256Checksum && before.sha256Checksum !== sha256) throw failure('PRIVATE_IMAGE_PREVIEW_CHANGED');
  const media = await request(`files/${fileId}?alt=media`, before.mimeType);
  if (media.headers?.get('content-type')?.split(';')[0].trim().toLowerCase() !== before.mimeType) {
    await media.body?.cancel?.().catch(() => {});
    throw failure('PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED', 400);
  }
  // Never emit even a prefix until both the complete hash and second private
  // ownership/revision snapshot have been verified.
  const buffer = await boundedBytes(media, Number(before.size), 'PRIVATE_IMAGE_PREVIEW_SIZE_INVALID');
  if (buffer.length !== Number(before.size) || crypto.createHash('sha256').update(buffer).digest('hex') !== sha256) throw failure('PRIVATE_IMAGE_PREVIEW_CHANGED');
  if (!hasRasterSignature(buffer, before.mimeType)) throw failure('PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED', 400);
  const after = await metadata();
  if (after.mimeType !== before.mimeType || Number(after.size) !== buffer.length || after.version !== before.version
    || after.sha256Checksum !== before.sha256Checksum || (after.sha256Checksum && after.sha256Checksum !== sha256)) throw failure('PRIVATE_IMAGE_PREVIEW_CHANGED');
  return { buffer, mimeType: before.mimeType, sha256, size: buffer.length };
}

/** Mount AFTER protect, using the content-factory router's existing functions:
 * router.get('/workspace/image-preview/:fileId', wrap(createImagePreviewHandler({
 *   canRead, ownerId, active: service.active
 * })));
 * The duplicate founder check is intentional defense against mounting mistakes.
 * No CSP is set here: the app must permit blob: in img-src for local object URLs.
 */
function createImagePreviewHandler({ canRead, ownerId, active, readImage = readExactPrivateImage }) {
  if (![canRead, ownerId, active, readImage].every(fn => typeof fn === 'function')) throw new TypeError('Founder policy functions are required');
  return async function imagePreview(req, res) {
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Expires: '0', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
    if (!canRead(req.user) || !active()) return res.status(404).json({ code: 'NOT_FOUND' });
    if (req.method !== 'GET') return res.status(405).set('Allow', 'GET').json({ code: 'METHOD_NOT_ALLOWED' });
    if (!req.query || Object.keys(req.query).some(key => key !== 'sha256') || typeof req.query.sha256 !== 'string'
      || !SHA256.test(req.query.sha256) || !validId(req.params?.fileId)) return res.status(400).json({ code: 'PRIVATE_IMAGE_PREVIEW_SNAPSHOT_REQUIRED' });
    const controller = new AbortController(), cancel = () => controller.abort();
    req.on?.('aborted', cancel); res.on?.('close', cancel);
    try {
      const result = await readImage({ owner: ownerId(), fileId: req.params.fileId, sha256: req.query.sha256, signal: controller.signal });
      if (controller.signal.aborted || res.destroyed) return;
      res.set({ 'Content-Type': result.mimeType, 'Content-Length': String(result.size), 'X-Image-SHA256': result.sha256, 'Content-Disposition': 'inline' });
      // res.send may generate an ETag/304. end always returns these verified bytes
      // and never creates a reusable conditional response for private previews.
      return res.end(result.buffer);
    } finally { req.off?.('aborted', cancel); res.off?.('close', cancel); }
  };
}

module.exports = { readExactPrivateImage, createImagePreviewHandler, MAX_IMAGE_BYTES };
