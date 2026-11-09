'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { readExactPrivateImage, createImagePreviewHandler, MAX_IMAGE_BYTES } = require('../enterprise/content/privateImagePreview');
const { BUSINESS_ACCOUNT } = require('./contentPrivateConfigFixture.cjs');
const policy = require('../enterprise/policy');

const owner = '1234567890abcdef12345678', fileId = 'synthetic_image_123456', token = 'SYNTHETIC_SECRET_DO_NOT_RETURN';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
function fixture(bytes = png, mimeType = 'image/png') {
  const calls = [], refreshes = [], options = {};
  const metadata = { id: fileId, mimeType, size: String(bytes.length), sha256Checksum: digest(bytes), version: '12', trashed: false,
    owners: [{ me: true, emailAddress: BUSINESS_ACCOUNT }], permissions: [{ type: 'user', role: 'owner', emailAddress: BUSINESS_ACCOUNT }], capabilities: { canDownload: true } };
  const connection = { userId: owner, status: 'connected', accountEmail: BUSINESS_ACCOUNT, scopes: ['https://www.googleapis.com/auth/drive.file'] };
  const workspaceImpl = { getFreshAccessToken: async args => { refreshes.push(args); if (options.refreshError) throw options.refreshError; return { connection, accessToken: options.token === undefined ? token : options.token }; } };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://www.googleapis.com'); assert.equal(parsed.pathname, `/drive/v3/files/${fileId}`);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, `Bearer ${token}`); assert(!url.includes(token)); assert.equal(init.body, undefined); assert(init.signal instanceof AbortSignal);
    if (options.response) { const response = await options.response(parsed, init, calls.length); if (response) return response; }
    if (parsed.searchParams.has('alt')) {
      assert.equal(parsed.searchParams.get('alt'), 'media');
      options.duringDownload?.(metadata);
      return new Response(options.bytes || bytes, { headers: { 'Content-Type': options.responseType || mimeType, ...(options.length === undefined ? {} : { 'Content-Length': String(options.length) }) } });
    }
    assert(parsed.searchParams.has('fields')); assert(!parsed.searchParams.has('q'));
    return Response.json(metadata);
  };
  return { calls, refreshes, options, metadata, connection, bytes,
    args: () => ({ owner, fileId, sha256: digest(bytes), workspaceImpl, fetchImpl }) };
}
const expectCode = async (f, code) => assert.rejects(readExactPrivateImage(f.args()), e => e.message === code && !!e.statusCode);

test('returns unchanged verified bytes only after private metadata recheck; no writes or public URLs', async () => {
  const f = fixture(), result = await readExactPrivateImage(f.args());
  assert.deepEqual(result, { buffer: png, size: png.length, sha256: digest(png), mimeType: 'image/png' });
  assert.deepEqual(f.refreshes, [{ owner }]); assert.equal(f.calls.length, 3);
  assert(f.calls[1].url.endsWith('?alt=media')); assert(f.calls[2].url.includes('?fields='));
  assert(!JSON.stringify(result).includes(token)); assert.equal(result.url, undefined);
});

test('PNG, JPEG and WebP use original bytes without a decoder or transformation', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 1, 255, 217]);
  const webp = Buffer.alloc(16); webp.write('RIFF'); webp.writeUInt32LE(8, 4); webp.write('WEBP', 8); webp.write('VP8 ', 12);
  for (const [bytes, type] of [[png, 'image/png'], [jpeg, 'image/jpeg'], [webp, 'image/webp']]) {
    const f = fixture(bytes, type), result = await readExactPrivateImage(f.args()); assert.deepEqual(result.buffer, bytes); assert.equal(result.mimeType, type);
  }
});

test('invalid owner, file and snapshot fail before token refresh or network requests', async () => {
  const f = fixture();
  for (const patch of [{ owner: null }, { owner: 'different' }, { fileId: '../etc/passwd' }, { fileId: ['valid_image_id'] }, { sha256: 'abc' }, { sha256: [digest(png)] }, { sha256: 'A'.repeat(64) }]) {
    await assert.rejects(readExactPrivateImage({ ...f.args(), ...patch }));
  }
  assert.equal(f.refreshes.length, 0); assert.equal(f.calls.length, 0);
});

test('requires the existing connected founder business token and drive.file scope', async () => {
  for (const alter of [f => { f.options.token = ''; }, f => { f.connection.userId = 'other'; }, f => { f.connection.status = 'revoked'; }, f => { f.connection.scopes = []; }, f => { f.connection.scopes = 'https://www.googleapis.com/auth/drive.file'; }]) {
    const f = fixture(); alter(f); await expectCode(f, 'DRIVE_DRAFT_AUTH_REQUIRED'); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.connection.accountEmail = 'personal@example.invalid'; await expectCode(f, 'GOOGLE_WORKSPACE_ACCOUNT_MISMATCH'); assert.equal(f.calls.length, 0);
});

test('missing/private-owner evidence fails closed before reading media', async () => {
  for (const alter of [
    m => { m.trashed = true; }, m => { delete m.trashed; }, m => { m.owners = []; }, m => { m.owners.push(copy(m.owners[0])); },
    m => { m.owners[0].me = false; }, m => { m.owners[0].emailAddress = 'other@example.invalid'; }, m => { delete m.permissions; }, m => { m.permissions = []; },
    m => { m.permissions.push({ type: 'anyone', role: 'reader' }); }, m => { m.permissions.push({ type: 'domain', role: 'reader' }); },
    m => { m.permissions.push({ type: 'user', role: 'reader', emailAddress: BUSINESS_ACCOUNT }); },
  ]) {
    const f = fixture(); alter(f.metadata); await expectCode(f, 'GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED'); assert.equal(f.calls.length, 1);
  }
  for (const permission of [false, undefined]) { const f = fixture(); f.metadata.capabilities.canDownload = permission; await expectCode(f, 'GOOGLE_DRIVE_MEDIA_READ_REQUIRED'); }
});

test('rejects non-raster types, invalid file identity and unbounded sizes before downloading', async () => {
  for (const mimeType of ['image/svg+xml', 'image/gif', 'image/avif', 'text/html', 'video/mp4']) {
    const f = fixture(); f.metadata.mimeType = mimeType; await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED'); assert.equal(f.calls.length, 1);
  }
  for (const size of ['0', '-1', '1.5', 'abc', null, MAX_IMAGE_BYTES + 1, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); f.metadata.size = size; await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_SIZE_INVALID'); assert.equal(f.calls.length, 1);
  }
  const f = fixture(); f.metadata.id = 'other_image_123'; await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED');
});

test('requires trustworthy revision metadata and well-formed optional checksum', async () => {
  for (const patch of [{ version: undefined }, { version: 'not_a_version' }, { sha256Checksum: null }, { sha256Checksum: '123' }]) {
    const f = fixture(); Object.assign(f.metadata, patch); await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_METADATA_INVALID');
  }
});

test('rejects changed metadata checksum before media and independently hashes downloaded bytes', async () => {
  const changed = fixture(); changed.metadata.sha256Checksum = 'b'.repeat(64); await expectCode(changed, 'PRIVATE_IMAGE_PREVIEW_CHANGED'); assert.equal(changed.calls.length, 1);
  const corrupted = fixture(); corrupted.options.bytes = Buffer.from(png); corrupted.options.bytes[20] ^= 1;
  await expectCode(corrupted, 'PRIVATE_IMAGE_PREVIEW_CHANGED'); assert.equal(corrupted.calls.length, 2);
  const missing = fixture(); delete missing.metadata.sha256Checksum;
  assert.deepEqual((await readExactPrivateImage(missing.args())).buffer, png); assert.equal(missing.calls.length, 3);
});

test('rechecks privacy and exact revision after downloading, before returning any bytes', async () => {
  for (const [alter, code] of [
    [m => { m.permissions.push({ type: 'anyone', role: 'reader' }); }, 'GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED'],
    [m => { m.owners[0].me = false; }, 'GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED'],
    [m => { m.version = '13'; }, 'PRIVATE_IMAGE_PREVIEW_CHANGED'],
    [m => { m.size = String(png.length + 1); }, 'PRIVATE_IMAGE_PREVIEW_CHANGED'],
    [m => { m.mimeType = 'image/jpeg'; }, 'PRIVATE_IMAGE_PREVIEW_CHANGED'],
    [m => { m.sha256Checksum = 'b'.repeat(64); }, 'PRIVATE_IMAGE_PREVIEW_CHANGED'],
    [m => { delete m.sha256Checksum; }, 'PRIVATE_IMAGE_PREVIEW_CHANGED'],
  ]) {
    const f = fixture(); f.options.duringDownload = alter; await expectCode(f, code); assert.equal(f.calls.length, 3);
  }
});

test('rejects misleading content types, active-format bytes and malformed WebP length', async () => {
  const wrong = fixture(); wrong.options.responseType = 'image/svg+xml'; await expectCode(wrong, 'PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED');
  const active = fixture(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')); await expectCode(active, 'PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED');
  const webp = Buffer.alloc(16); webp.write('RIFF'); webp.write('WEBP', 8);
  await expectCode(fixture(webp, 'image/webp'), 'PRIVATE_IMAGE_PREVIEW_TYPE_REQUIRED');
});

test('bounds declared and actual body size and rejects truncated responses', async () => {
  for (const length of [MAX_IMAGE_BYTES + 1, png.length + 1, 'invalid']) { const f = fixture(); f.options.length = length; await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_SIZE_INVALID'); }
  const oversized = fixture(); oversized.options.bytes = Buffer.concat([png, Buffer.from('extra')]); await expectCode(oversized, 'PRIVATE_IMAGE_PREVIEW_SIZE_INVALID');
  const truncated = fixture(); truncated.options.bytes = png.subarray(0, png.length - 1); await expectCode(truncated, 'PRIVATE_IMAGE_PREVIEW_CHANGED');
  const wrongLength = fixture(); wrongLength.options.length = png.length - 1; await expectCode(wrongLength, 'PRIVATE_IMAGE_PREVIEW_CHANGED');
  const exactLength = fixture(); exactLength.options.length = png.length; assert.deepEqual((await readExactPrivateImage(exactLength.args())).buffer, png);
});

test('oversized streaming responses are cancelled without reading the remainder', async () => {
  const f = fixture(); let cancelled = false, readCount = 0;
  f.options.response = async url => url.searchParams.has('alt') ? new Response(new ReadableStream({
    pull(controller) { readCount++; controller.enqueue(new Uint8Array(png.length + 1)); }, cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'image/png' } }) : null;
  await expectCode(f, 'PRIVATE_IMAGE_PREVIEW_SIZE_INVALID'); assert(cancelled); assert(readCount <= 2);
});

test('bounds metadata and sanitizes refresh/network/provider failures', async () => {
  const large = fixture(); large.options.response = async () => new Response(' '.repeat(65537)); await expectCode(large, 'PRIVATE_IMAGE_PREVIEW_METADATA_INVALID');
  const invalid = fixture(); invalid.options.response = async () => new Response('{oops'); await expectCode(invalid, 'PRIVATE_IMAGE_PREVIEW_METADATA_INVALID');
  const refresh = fixture(); refresh.options.refreshError = new Error(token); await expectCode(refresh, 'DRIVE_DRAFT_AUTH_REQUIRED');
  const network = fixture(); network.options.response = async () => { throw new Error(token); }; await expectCode(network, 'PRIVATE_IMAGE_PREVIEW_UNAVAILABLE');
  for (const status of [401, 403, 404, 500]) {
    const f = fixture(); f.options.response = async () => new Response(token, { status });
    await assert.rejects(readExactPrivateImage(f.args()), e => !e.message.includes(token) && !!e.statusCode);
  }
});

function routeFixture() {
  const env = { ENTERPRISE_INTELLIGENCE_ENABLED: 'true', ENTERPRISE_OWNER_USER_ID: owner }, calls = [];
  const req = Object.assign(new EventEmitter(), { method: 'GET', user: { _id: owner, role: 'COMMANDER_IN_CHIEF' }, params: { fileId }, query: { sha256: digest(png) }, headers: { 'if-none-match': '*' } });
  const res = Object.assign(new EventEmitter(), { headers: {}, statusCode: 200, set(key, value) { Object.assign(this.headers, typeof key === 'object' ? key : { [key]: value }); return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value; return this; } });
  const readImage = async args => { calls.push(args); return { buffer: png, size: png.length, mimeType: 'image/png', sha256: digest(png) }; };
  const args = () => ({ canRead: user => policy.canRead(user, env), ownerId: () => policy.ownerId(env), active: () => true, readImage });
  return { req, res, calls, env, args };
}

test('endpoint uses exact existing founder policy before reading bytes', async () => {
  for (const user of [null, { _id: owner, role: 'USER' }, { _id: 'a'.repeat(24), role: 'COMMANDER_IN_CHIEF' }]) {
    const f = routeFixture(); f.req.user = user; await createImagePreviewHandler(f.args())(f.req, f.res);
    assert.equal(f.res.statusCode, 404); assert.equal(f.calls.length, 0); assert.match(f.res.headers['Cache-Control'], /no-store/);
  }
  for (const patch of [{ active: () => false }, { canRead: () => false }]) {
    const f = routeFixture(); await createImagePreviewHandler({ ...f.args(), ...patch })(f.req, f.res); assert.equal(f.res.statusCode, 404); assert.equal(f.calls.length, 0);
  }
});

test('endpoint rejects credentials/extras in query, malformed snapshots and unsupported methods', async () => {
  for (const query of [{}, { sha256: [digest(png)] }, { sha256: digest(png), access_token: token }, { sha256: digest(png), owner }]) {
    const f = routeFixture(); f.req.query = query; await createImagePreviewHandler(f.args())(f.req, f.res); assert.equal(f.res.statusCode, 400); assert.equal(f.calls.length, 0);
  }
  const f = routeFixture(); f.req.method = 'HEAD'; await createImagePreviewHandler(f.args())(f.req, f.res); assert.equal(f.res.statusCode, 405); assert.equal(f.calls.length, 0);
});

test('endpoint responds with exact bytes, no-store and nosniff, without ETag/304 or replacing CSP', async () => {
  const f = routeFixture(); f.res.headers['Content-Security-Policy'] = "default-src 'self'";
  await createImagePreviewHandler(f.args())(f.req, f.res);
  assert.equal(f.res.statusCode, 200); assert.deepEqual(f.res.body, png); assert.equal(f.calls[0].owner, owner); assert.equal(f.calls[0].sha256, digest(png));
  assert.match(f.res.headers['Cache-Control'], /private.*no-store/); assert.equal(f.res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(f.res.headers['Content-Type'], 'image/png'); assert.equal(f.res.headers['Content-Length'], String(png.length));
  assert.equal(f.res.headers['Cross-Origin-Resource-Policy'], 'same-origin'); assert.equal(f.res.headers['X-Image-SHA256'], digest(png));
  assert.equal(f.res.headers.ETag, undefined); assert.equal(f.res.headers['Content-Security-Policy'], "default-src 'self'");
  assert.equal(f.req.listenerCount('aborted'), 0); assert.equal(f.res.listenerCount('close'), 0);
});

test('disconnect aborts in-flight read and does not emit bytes; errors also remove listeners', async () => {
  const f = routeFixture();
  await createImagePreviewHandler({ ...f.args(), readImage: async ({ signal }) => { f.res.emit('close'); assert(signal.aborted); return { buffer: png }; } })(f.req, f.res);
  assert.equal(f.res.body, undefined); assert.equal(f.req.listenerCount('aborted'), 0);
  const failed = routeFixture();
  await assert.rejects(createImagePreviewHandler({ ...failed.args(), readImage: async () => { throw new Error('known failure'); } })(failed.req, failed.res));
  assert.equal(failed.res.body, undefined); assert.equal(failed.res.listenerCount('close'), 0);
});
