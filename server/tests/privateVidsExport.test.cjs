'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { BUSINESS_ACCOUNT } = require('./contentPrivateConfigFixture.cjs');
const { inspectPrivateVids, exportPrivateVids, KIND, VIDS_MIME, MP4_MIME, MAX_EXPORT_BYTES, UPLOAD_CHUNK_BYTES } = require('../enterprise/content/privateVidsExport');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const owner = '1234567890abcdef12345678', folderId = 'organic_folder_12345', factoryId = 'factory_folder_12345';
const sourceId = 'google_vids_source_12345', outputId = 'private_video_output_12345', operationName = 'export_123456';
const uri = 'https://drive.usercontent.google.com/download?secret=DO_NOT_EXPOSE';
const session = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=PRIVATE_SESSION';
function privateMeta(id, mimeType) {
  return { id, name: id, mimeType, version: '17', modifiedTime: '2026-11-07T00:00:00Z', trashed: false,
    owners: [{ me: true, emailAddress: BUSINESS_ACCOUNT }], permissions: [{ type: 'user', role: 'owner', emailAddress: BUSINESS_ACCOUNT }],
    capabilities: { canEdit: true, canDownload: true } };
}
function mp4(size = 70000) {
  const bytes = Buffer.alloc(size, 37); bytes.writeUInt32BE(24); bytes.write('ftyp', 4); bytes.write('isom', 8); return bytes;
}
function streamResponse(bytes, headers = {}, onChunk) {
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const end = Math.min(bytes.length, offset + 32768); controller.enqueue(bytes.subarray(offset, end)); offset = end; onChunk?.(offset);
  } }), { headers: { 'content-type': MP4_MIME, 'content-length': String(bytes.length), ...headers } });
}
function fixture(size) {
  const calls = [], chunks = [], files = new Map(), options = {}, bytes = mp4(size);
  const connection = { userId: owner, status: 'connected', accountEmail: BUSINESS_ACCOUNT, scopes: ['https://www.googleapis.com/auth/drive.file'],
    metadata: { canonicalStorage: { provider: 'GOOGLE_DRIVE', contentFactoryFolderId: factoryId, folders: { Organic: folderId } } } };
  const about = { user: { emailAddress: BUSINESS_ACCOUNT, me: true } };
  files.set(folderId, { ...privateMeta(folderId, 'application/vnd.google-apps.folder'), name: 'Organic', parents: [factoryId] });
  files.set(sourceId, privateMeta(sourceId, VIDS_MIME));
  const operation = { name: operationName, done: true, metadata: { '@type': 'type.googleapis.com/google.apps.drive.v3.DownloadFileMetadata' },
    response: { '@type': 'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse', downloadUri: uri, partialDownloadAllowed: false } };
  let uploadedMetadata, accepted = 0;
  const fetchImpl = async (url, request) => {
    const u = new URL(url), call = { url, method: request.method || 'GET', headers: request.headers }; calls.push(call);
    assert.equal(request.redirect, 'manual'); assert(request.signal instanceof AbortSignal);
    if (u.hostname === 'www.googleapis.com') assert.equal(request.headers.Authorization, 'Bearer SYNTHETIC_TOKEN');
    else assert.equal(request.headers.Authorization, undefined, 'Never forward OAuth token to a download CDN');
    const intercepted = await options.onRequest?.(u, request); if (intercepted) return intercepted;
    if (u.hostname !== 'www.googleapis.com') return options.downloadResponse?.() || streamResponse(bytes, options.downloadHeaders, options.onChunk);
    if (u.pathname === '/drive/v3/about') return Response.json(about);
    if (u.pathname === '/drive/v3/files' && call.method === 'GET') {
      assert(u.searchParams.get('q').includes("key='operationId'"));
      return Response.json({ files: [...files.values()].filter(m => m.appProperties?.kind === KIND), ...options.lookup });
    }
    if (u.pathname === `/drive/v3/files/${sourceId}/download`) {
      assert.equal(call.method, 'POST'); assert.equal(u.searchParams.get('mimeType'), MP4_MIME);
      assert.equal(u.searchParams.has('revisionId'), false, 'Vids does not support revisionId');
      assert.equal(request.body, undefined); assert.equal(request.headers['Content-Length'], '0');
      if (options.loseStart) throw new Error(`Lost response ${uri}`);
      return Response.json(operation);
    }
    if (u.pathname.startsWith('/drive/v3/operations/')) {
      assert.equal(call.method, 'GET'); assert.equal(u.pathname, `/drive/v3/operations/${encodeURIComponent(operation.name)}`);
      return options.pollResponse || Response.json(operation);
    }
    if (u.pathname === '/upload/drive/v3/files') {
      if (call.method === 'POST') {
        uploadedMetadata = JSON.parse(request.body); assert.equal(uploadedMetadata.mimeType, MP4_MIME);
        assert.deepEqual(uploadedMetadata.parents, [folderId]); assert.equal(request.headers['X-Upload-Content-Length'], String(bytes.length));
        if (options.loseInit) throw new Error(`Lost upload init ${session}`);
        return new Response(null, { headers: { Location: options.session || session } });
      }
      assert.equal(call.method, 'PUT'); assert(Buffer.isBuffer(request.body)); assert(request.body.length <= UPLOAD_CHUNK_BYTES);
      assert.equal(request.headers['Content-Range'], `bytes ${accepted}-${accepted + request.body.length - 1}/${bytes.length}`);
      chunks.push(Buffer.from(request.body)); accepted += request.body.length;
      if (options.chunkResponse) return options.chunkResponse;
      if (accepted < bytes.length) return new Response(null, { status: 308, headers: { Range: `bytes=0-${accepted - 1}` } });
      files.set(outputId, { ...privateMeta(outputId, MP4_MIME), ...uploadedMetadata, size: String(accepted), sha256Checksum: digest(Buffer.concat(chunks)) });
      options.afterUpload?.(files.get(outputId));
      if (options.loseFinal) throw new Error(`Lost upload final ${session}`);
      return Response.json({ id: outputId });
    }
    const id = u.pathname.split('/').at(-1), meta = files.get(id); assert(meta, `Unexpected file ${id}`);
    if (u.searchParams.get('alt') === 'media') return streamResponse(options.reconcileBytes || Buffer.concat(chunks));
    options.beforeMetadata?.(id, meta); return Response.json(meta);
  };
  const workspaceImpl = { getFreshAccessToken: async () => ({ connection, accessToken: 'SYNTHETIC_TOKEN' }) };
  const args = { owner, itemId: 'organic-d01-example', vidsFileId: sourceId, expectedHash: 'a'.repeat(64), operationId: 'export-job-12345678', workspaceImpl, fetchImpl };
  const ready = async () => { args.sourceReceipt = await inspectPrivateVids(args); return args; };
  return { args, ready, files, calls, chunks, options, operation, connection, about, bytes };
}
const writes = f => f.calls.filter(c => c.method !== 'GET');

test('preflight is read-only, business-owned and bound to exact package/item/job/source version', async () => {
  const f = fixture(), receipt = await inspectPrivateVids(f.args);
  assert.equal(receipt.fileId, sourceId); assert.equal(receipt.sourceHash, f.args.expectedHash);
  assert.equal(receipt.operationId, f.args.operationId); assert.equal(receipt.itemId, f.args.itemId); assert.equal(receipt.version, '17');
  const { receiptHash, ...fields } = receipt; assert.equal(receiptHash, digest(JSON.stringify(fields))); assert.equal(writes(f).length, 0);
});

test('default invocation never creates a download operation or an upload', async () => {
  const f = fixture(); await f.ready();
  await assert.rejects(exportPrivateVids(f.args), e => e.message === 'GOOGLE_VIDS_OUTCOME_UNCERTAIN' && e.outcomeUnknown && !e.startAttempted && !e.uploadAttempted);
  assert.equal(writes(f).length, 0);
});

test('official immediate-completion response streams bounded chunks only into private Drive and verifies SHA256', async () => {
  const f = fixture(UPLOAD_CHUNK_BYTES * 2 + 31); await f.ready();
  const result = await exportPrivateVids({ ...f.args, allowCreate: true });
  assert.equal(result.status, 'VIDEO_DRAFT_SAVED'); assert.equal(result.sha256, digest(f.bytes)); assert.equal(result.size, f.bytes.length);
  assert.equal(result.fileId, outputId); assert.equal(result.approval, 'FOUNDER_REVIEW_REQUIRED'); assert.equal(result.videoApproval, false);
  assert.equal(result.visualQA, 'PENDING'); assert.equal(result.audioQA, 'PENDING'); assert.equal(result.reconciled, false);
  assert.equal(f.chunks.length, 3); assert.deepEqual(Buffer.concat(f.chunks), f.bytes);
  assert.equal(f.calls.filter(c => c.url.includes('/operations/')).length, 0, 'Do not poll an already completed start response');
  assert(!JSON.stringify(result).includes('DO_NOT_EXPOSE')); assert(!JSON.stringify(result).includes('PRIVATE_SESSION'));
  assert.equal(f.files.get(outputId).appProperties.sourceReceiptHash, f.args.sourceReceipt.receiptHash);
  assert.equal(f.files.get(outputId).appProperties.downloadOperationHash, digest(operationName));
  assert(f.calls.every(c => !/permissions|publish|schedule|generate|batchUpdate/.test(new URL(c.url).pathname)));
});

for (const pending of [undefined, null, false]) test(`official pending done=${pending} returns safe operation metadata without uploading`, async () => {
  const f = fixture(); await f.ready(); f.operation.done = pending; delete f.operation.response;
  const result = await exportPrivateVids({ ...f.args, allowCreate: true });
  assert.equal(result.status, 'GOOGLE_VIDS_EXPORT_PENDING'); assert.equal(result.operationName, operationName);
  assert.equal(result.retryAfterSeconds, 10); assert.equal(result.startAttempted, true); assert.equal(result.uploadAttempted, false);
  assert.equal(writes(f).length, 1);
});

test('explicit read-only poll never restarts or transfers a completed operation', async () => {
  const f = fixture(); await f.ready();
  const result = await exportPrivateVids({ ...f.args, operationName });
  assert.equal(result.status, 'GOOGLE_VIDS_READY_TO_TRANSFER'); assert.equal(result.uploadAttempted, false);
  assert.equal(writes(f).length, 0); assert(!f.calls.some(c => c.url === uri));
});

test('locked polling continuation completes transfer without starting a second operation', async () => {
  const f = fixture(); await f.ready();
  const result = await exportPrivateVids({ ...f.args, operationName, allowCreate: true });
  assert.equal(result.status, 'VIDEO_DRAFT_SAVED'); assert.equal(result.startAttempted, false);
  assert(!f.calls.some(c => c.method === 'POST' && new URL(c.url).pathname.endsWith('/download')));
});

test('lost operation start is uncertain, never automatically retried, and errors reveal no download URI', async () => {
  const f = fixture(); await f.ready(); f.options.loseStart = true;
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.outcomeUnknown && e.startAttempted && !e.uploadAttempted && !JSON.stringify(e).includes('secret='));
  await assert.rejects(exportPrivateVids(f.args), /OUTCOME_UNCERTAIN/); assert.equal(writes(f).length, 1);
});

for (const stage of ['loseInit', 'loseFinal']) test(`uncertain ${stage} is not replayed; completed output reconciles read-only`, async () => {
  const f = fixture(); await f.ready(); f.options[stage] = true;
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.outcomeUnknown && e.uploadAttempted && !JSON.stringify(e).includes('PRIVATE_SESSION'));
  const count = writes(f).length;
  if (stage === 'loseFinal') {
    const result = await exportPrivateVids(f.args); assert.equal(result.status, 'VIDEO_DRAFT_SAVED'); assert.equal(result.reconciled, true);
    assert.equal(result.sha256, digest(f.bytes));
  } else await assert.rejects(exportPrivateVids(f.args), /OUTCOME_UNCERTAIN/);
  assert.equal(writes(f).length, count);
});

for (const problem of ['account', 'scope', 'privacy', 'mime', 'version', 'download', 'folder', 'about']) test(`rejects ${problem} before any writes`, async () => {
  const f = fixture(); await f.ready();
  if (problem === 'account') f.connection.accountEmail = 'personal@gmail.com';
  if (problem === 'scope') f.connection.scopes = ['openid'];
  if (problem === 'privacy') f.files.get(sourceId).permissions.push({ type: 'anyone', role: 'reader' });
  if (problem === 'mime') f.files.get(sourceId).mimeType = MP4_MIME;
  if (problem === 'version') f.files.get(sourceId).version = '18';
  if (problem === 'download') f.files.get(sourceId).capabilities.canDownload = false;
  if (problem === 'folder') f.files.get(folderId).permissions.push({ type: 'domain', role: 'reader' });
  if (problem === 'about') f.about.user.emailAddress = 'personal@gmail.com';
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true })); assert.equal(writes(f).length, 0);
});

for (const field of ['owner', 'itemId', 'operationId', 'sourceHash', 'fileId', 'version', 'receiptHash']) test(`receipt ${field} cannot be rebound`, async () => {
  const f = fixture(); await f.ready(); f.args.sourceReceipt[field] = 'different';
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), /SOURCE_CHANGED/); assert.equal(writes(f).length, 0);
});

for (const target of ['http://drive.usercontent.google.com/a', 'https://evil.invalid/a', 'https://googleusercontent.com.evil.invalid/a',
  'https://www.googleapis.com@evil.invalid/a', 'https://www.googleapis.com:444/a', 'https://127.0.0.1/a', 'https://www.googleapis.com/a#secret']) {
  test(`rejects untrusted download URI ${target}`, async () => {
    const f = fixture(); await f.ready(); f.operation.response.downloadUri = target;
    await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), /DOWNLOAD_URI_INVALID/);
    assert.equal(writes(f).length, 1); assert(!f.calls.some(c => c.url === target));
  });
}

test('manual redirect validates the next host and never leaks credentials', async () => {
  const f = fixture(); await f.ready();
  f.options.onRequest = u => u.hostname === 'drive.usercontent.google.com' ? new Response(null, { status: 302, headers: { Location: 'https://evil.invalid/steal' } }) : undefined;
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), /DOWNLOAD_URI_INVALID/);
  assert(!f.calls.some(c => c.url.includes('evil.invalid'))); assert.equal(writes(f).length, 1);
});

test('documented Google delivery-host redirect works without forwarding OAuth token', async () => {
  const f = fixture(); await f.ready();
  f.options.onRequest = u => u.hostname === 'drive.usercontent.google.com' ? new Response(null, { status: 302, headers: { Location: 'https://content.googleusercontent.com/video?key=PRIVATE' } }) : undefined;
  const result = await exportPrivateVids({ ...f.args, allowCreate: true }); assert.equal(result.status, 'VIDEO_DRAFT_SAVED');
  assert(!JSON.stringify(result).includes('key=PRIVATE'));
});

for (const problem of ['absent length', 'oversize', 'encoding', 'mime', 'truncated', 'invalid mp4']) test(`fails safely for ${problem}`, async () => {
  const f = fixture(); await f.ready();
  if (problem === 'absent length') f.options.downloadResponse = () => new Response(f.bytes, { headers: { 'content-type': MP4_MIME } });
  if (problem === 'oversize') f.options.downloadHeaders = { 'content-length': String(MAX_EXPORT_BYTES + 1) };
  if (problem === 'encoding') f.options.downloadHeaders = { 'content-encoding': 'gzip' };
  if (problem === 'mime') f.options.downloadHeaders = { 'content-type': 'text/html' };
  if (problem === 'truncated') f.options.downloadHeaders = { 'content-length': String(f.bytes.length + 5) };
  if (problem === 'invalid mp4') f.bytes.write('html', 4);
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }));
  assert.equal(f.chunks.length, 0); assert(!f.calls.some(c => c.method === 'DELETE'));
});

test('changed source during transfer retains partial Drive session and cannot finish', async () => {
  const f = fixture(UPLOAD_CHUNK_BYTES * 2 + 31); await f.ready();
  f.options.onChunk = offset => { if (offset === f.bytes.length) f.files.get(sourceId).version = '18'; };
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.message === 'GOOGLE_VIDS_SOURCE_CHANGED' && e.uploadAttempted && e.outcomeUnknown);
  assert(f.chunks.length > 0 && f.chunks.length < 3); assert(!f.files.has(outputId)); assert(!f.calls.some(c => c.method === 'DELETE'));
});

test('wrong resumable acknowledgement stops immediately rather than replaying a chunk', async () => {
  const f = fixture(UPLOAD_CHUNK_BYTES + 31); await f.ready();
  f.options.chunkResponse = new Response(null, { status: 308, headers: { Range: 'bytes=0-42' } });
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.message === 'GOOGLE_VIDS_UPLOAD_OUTCOME_UNCERTAIN' && e.outcomeUnknown);
  assert.equal(f.chunks.length, 1);
});

test('session upload host is validated before sending video bytes or credentials', async () => {
  const f = fixture(); await f.ready(); f.options.session = 'https://evil.invalid/upload';
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), /UPLOAD_URI_INVALID/);
  assert.equal(f.chunks.length, 0); assert(!f.calls.some(c => c.url.includes('evil.invalid')));
});

test('output checksum/privacy failures retain the output and never claim approval', async () => {
  const f = fixture(); await f.ready(); f.options.afterUpload = meta => { meta.sha256Checksum = 'f'.repeat(64); };
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.message === 'GOOGLE_VIDS_OUTPUT_MISMATCH' && e.fileId === outputId && e.outcomeUnknown);
  assert(f.files.has(outputId)); assert(!f.calls.some(c => c.method === 'DELETE'));
});

test('ambiguous or incomplete reconciliation never creates duplicate output', async () => {
  for (const lookup of [{ nextPageToken: 'next' }, { incompleteSearch: true }, { files: [{}, {}] }]) {
    const f = fixture(); await f.ready(); f.options.lookup = lookup;
    await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), /OPERATION_AMBIGUOUS/); assert.equal(writes(f).length, 0);
  }
});

test('official operation error is sanitized and unsupported fake downloadUrl shape rejected', async () => {
  const f = fixture(); await f.ready(); delete f.operation.response;
  f.operation.error = { code: 7, message: uri, details: [{ uri: session }] };
  await assert.rejects(exportPrivateVids({ ...f.args, allowCreate: true }), e => e.message === 'GOOGLE_VIDS_OPERATION_FAILED' && !JSON.stringify(e).includes('DO_NOT_EXPOSE'));
  const g = fixture(); await g.ready(); g.operation.response.downloadUrl = uri; delete g.operation.response.downloadUri;
  await assert.rejects(exportPrivateVids({ ...g.args, allowCreate: true }), /DOWNLOAD_URI_INVALID/);
});

test('expired or unpollable operation is not restarted', async () => {
  const f = fixture(); await f.ready(); f.options.pollResponse = new Response(null, { status: 403 });
  await assert.rejects(exportPrivateVids({ ...f.args, operationName, allowCreate: true }), /HTTP_403/); assert.equal(writes(f).length, 0);
});

test('adapter stages no draft media or receipts on disk', async () => {
  const f = fixture(); await f.ready(); const fs = require('node:fs'), originals = {};
  for (const key of ['writeFile', 'writeFileSync', 'createWriteStream', 'readFile', 'readFileSync', 'createReadStream']) { originals[key] = fs[key]; fs[key] = () => { throw new Error(`Unexpected disk I/O: ${key}`); }; }
  try { assert.equal((await exportPrivateVids({ ...f.args, allowCreate: true })).status, 'VIDEO_DRAFT_SAVED'); }
  finally { for (const [key, fn] of Object.entries(originals)) fs[key] = fn; }
});


test('poll URL preserves an opaque server operation name instead of rewriting its prefix', async () => {
  const f = fixture(); await f.ready(); f.operation.name = 'operations/export_123456';
  const result = await exportPrivateVids({ ...f.args, operationName: f.operation.name });
  assert.equal(result.operationName, f.operation.name);
  assert(f.calls.some(c => c.url.endsWith('/operations/operations%2Fexport_123456')));
});


test('lookup-only recovery does not poll or start a known operation when output is absent', async () => {
  const f = fixture(); await f.ready();
  await assert.rejects(exportPrivateVids({ ...f.args, operationName, reconcileOnly: true }), /OUTCOME_UNCERTAIN/);
  assert.equal(writes(f).length, 0); assert(!f.calls.some(c => c.url.includes('/operations/')));
  await assert.rejects(exportPrivateVids({ ...f.args, operationName, reconcileOnly: true, allowCreate: true }), /OPERATION_INVALID/);
});
