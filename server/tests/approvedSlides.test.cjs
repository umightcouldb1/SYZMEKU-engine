'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const JSZip = createRequire(require.resolve('pptxgenjs'))('jszip');
const { hash } = require('../enterprise/content/qa');
const { selectionHash, VERSION } = require('../enterprise/content/driveVisual');
const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID } = require('./contentPrivateConfigFixture.cjs');
const { createApprovedSlides, KIND, PRESENTATION_MIME, PPTX_MIME, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } = require('../enterprise/content/approvedSlides');

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const owner = '1234567890abcdef12345678';
const folderId = 'organic_folder_12345', factoryId = 'factory_folder_12345', imageId = 'scene_image_12345678';
// A synthetic 8x4 gray JPEG, generated once in memory. No external asset or file.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEACgcHiMeGSgjISMtKygwPGRBPDc3PHtYXUlkkYCZlo+AjIqgtObDoKrarYqMyP/L2u71////m8H////6/+b9//gBKy0tPDU8dkFBdviljKX4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+P/AABEIAAQACAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AKtAH//Z', 'base64');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width = 8, height = 4, shade = 80) {
  const chunk = (type, data) => {
    const typed = Buffer.concat([Buffer.from(type), data]), head = Buffer.alloc(4), crc = Buffer.alloc(4);
    head.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(typed)); return Buffer.concat([head, typed, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4), shade);
  for (let y = 0; y < height; y++) { rows[y * (1 + width * 4)] = 0; for (let x = 0; x < width; x++) rows[y * (1 + width * 4) + 1 + x * 4 + 3] = 255; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function privateMeta(id, mimeType) {
  return { id, name: id, mimeType, trashed: false, owners: [{ me: true, emailAddress: BUSINESS_ACCOUNT }],
    permissions: [{ type: 'user', role: 'owner', emailAddress: BUSINESS_ACCOUNT }], capabilities: { canEdit: true, canDownload: true } };
}
function fixture(aspectRatio = '9:16') {
  const files = new Map(), calls = [], uploads = [], options = {};
  const addImage = (id, bytes, mimeType = 'image/png') => {
    const meta = { ...privateMeta(id, mimeType), size: String(bytes.length), sha256Checksum: digest(bytes) };
    files.set(id, { meta, bytes }); return { fileId: id, sha256: digest(bytes), mimeType, url: `https://untrusted.invalid/ignored/${id}` };
  };
  files.set(folderId, { meta: { ...privateMeta(folderId, 'application/vnd.google-apps.folder'), name: 'Organic', parents: [factoryId] } });
  const reference = addImage(ORIGINAL_LOGO_FILE_ID, png(4, 4, 30));
  const source = addImage(imageId, png());
  const images = [{ ...source, sceneIndex: 0 }, { ...source, sceneIndex: 1 }];
  const approval = { reference, images, selectionHash: selectionHash({ reference, images }), approvedBy: owner, approvedAt: '2026-11-07T00:00:00Z' };
  const p = { title: 'Exact approved scene draft', aspectRatio, visual: { version: VERSION, status: 'FOUNDER_IMAGES_APPROVED', reference },
    scenes: [
      { screen: 'Keep the exact words.\nLine two & <literal>', narration: 'Exact narration, with spaces.\n\nNext paragraph.  ', visual: { fileId: imageId, sha256: source.sha256 } },
      { screen: 'A second editable scene', narration: 'The second scene must stay separate.', visual: { fileId: imageId, sha256: source.sha256 } },
    ], production: { imageApproval: approval } };
  const connection = { userId: owner, accountEmail: BUSINESS_ACCOUNT, status: 'connected',
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/presentations'],
    metadata: { canonicalStorage: { provider: 'GOOGLE_DRIVE', contentFactoryFolderId: factoryId, folders: { Organic: folderId } } } };
  const about = { user: { emailAddress: BUSINESS_ACCOUNT, me: true }, importFormats: { [PPTX_MIME]: [PRESENTATION_MIME] } };
  const workspaceImpl = { getFreshAccessToken: async ({ owner: requested }) => { assert.equal(requested, owner); return { connection, accessToken: 'SYNTHETIC_TOKEN_ONLY' }; } };
  const args = () => ({ owner, itemId: 'organic-d01-example', package: p, expectedHash: hash(p), operationId: 'operation-12345678', workspaceImpl, fetchImpl, allowCreate: true });
  function presentation(id) {
    const portrait = p.aspectRatio === '9:16', width = portrait ? 540 : 960, height = portrait ? 960 : 540;
    return { presentationId: id, pageSize: { width: { magnitude: width, unit: 'PT' }, height: { magnitude: height, unit: 'PT' } },
      slides: p.scenes.map((scene, i) => ({ objectId: `slide_${i}`, pageElements: [
        { objectId: `image_${i}`, image: { contentUrl: 'https://googleusercontent.invalid/never-fetch?token=SECRET', imageProperties: {} },
          size: { width: { magnitude: 200, unit: 'PT' }, height: { magnitude: 100, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 30, translateY: 30, unit: 'PT' } },
        { objectId: `text_${i}`, shape: { text: { textElements: [{ textRun: { content: `${scene.screen}\n` } }] } } },
      ], slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: `notes_${i}` }, pageElements: [
        { objectId: `notes_${i}`, shape: { text: { textElements: [{ textRun: { content: `${scene.narration}\n` } }] } } },
      ] } } })) };
  }
  const fetchImpl = async (url, request = {}) => {
    const call = { url, method: request.method || 'GET', request }; calls.push(call);
    assert.equal(request.headers.Authorization, 'Bearer SYNTHETIC_TOKEN_ONLY'); assert.equal(request.redirect, 'error');
    assert(request.signal instanceof AbortSignal);
    const u = new URL(url);
    if (options.onRequest) { const intercepted = await options.onRequest(u, request); if (intercepted) return intercepted; }
    assert(['www.googleapis.com', 'slides.googleapis.com'].includes(u.hostname), 'No third-party/image URL is contacted');
    if (u.hostname === 'slides.googleapis.com') {
      assert.equal(request.method || 'GET', 'GET');
      const result = presentation(u.pathname.split('/').at(-1)); options.alterSlides?.(result); return Response.json(result);
    }
    if (u.pathname === '/drive/v3/about') return Response.json(about);
    if (u.pathname === '/drive/v3/files') {
      assert(u.searchParams.get('q').includes("key='operationId'"));
      const found = [...files.values()].filter(f => f.meta.appProperties?.kind === KIND).map(f => copy(f.meta));
      return Response.json({ files: found, ...(options.lookup || {}) });
    }
    if (u.pathname === '/upload/drive/v3/files') {
      assert.equal(request.method, 'POST'); assert.equal(u.searchParams.get('uploadType'), 'multipart');
      const body = request.body, boundary = request.headers['Content-Type'].split('boundary=')[1];
      assert(Buffer.isBuffer(body)); assert(body.length <= MAX_UPLOAD_BYTES);
      const divider = Buffer.from('\r\n\r\n'), first = body.indexOf(divider) + divider.length;
      const middle = body.indexOf(Buffer.from(`\r\n--${boundary}\r\n`), first);
      const meta = JSON.parse(body.subarray(first, middle).toString());
      const second = body.indexOf(divider, middle) + divider.length;
      const end = body.indexOf(Buffer.from(`\r\n--${boundary}--`), second);
      assert(body.subarray(middle, second).toString().includes(PPTX_MIME));
      uploads.push({ meta, bytes: Buffer.from(body.subarray(second, end)) });
      assert.equal(meta.mimeType, PRESENTATION_MIME); assert.deepEqual(meta.parents, [folderId]);
      const id = 'converted_slides_123456';
      if (!options.skipCreate) files.set(id, { meta: { ...privateMeta(id, PRESENTATION_MIME), ...meta } });
      options.afterUpload?.(files.get(id));
      if (options.loseResponse) throw new Error('Synthetic response loss AFTER write');
      return options.uploadResponse || Response.json({ id });
    }
    const id = u.pathname.split('/').at(-1), file = files.get(id);
    assert(file, `Unexpected file ${id}`);
    return u.searchParams.get('alt') === 'media' ? new Response(file.bytes) : Response.json(file.meta);
  };
  return { files, calls, uploads, options, p, connection, about, workspaceImpl, fetchImpl, args, addImage };
}

for (const aspect of ['9:16', '16:9']) test(`private ${aspect} conversion embeds only approved bytes and native editable copy in RAM`, async () => {
  const f = fixture(aspect), result = await createApprovedSlides(f.args());
  assert.equal(result.structuralQA, 'PASS'); assert.equal(result.visualQA, 'PENDING'); assert.equal(result.videoApproval, false);
  assert.equal(result.approval, 'FOUNDER_REVIEW_REQUIRED'); assert.equal(result.sourceHash, hash(f.p));
  assert.equal(result.selectionHash, f.p.production.imageApproval.selectionHash); assert.equal(result.reconciled, false);
  assert(!JSON.stringify(result).includes('contentUrl')); assert(!JSON.stringify(result).includes('SECRET'));
  assert.equal(f.uploads.length, 1); assert.deepEqual(f.uploads[0].meta.appProperties, {
    kind: KIND, owner, itemId: f.args().itemId, sourceHash: hash(f.p), selectionHash: result.selectionHash, operationId: f.args().operationId,
  });
  const zip = await JSZip.loadAsync(f.uploads[0].bytes);
  const deck = await zip.file('ppt/presentation.xml').async('string');
  const size = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(deck); assert(size);
  assert(Math.abs(Number(size[1]) / Number(size[2]) - (aspect === '9:16' ? 9 / 16 : 16 / 9)) < 0.00001);
  const media = Object.keys(zip.files).filter(name => /^ppt\/media\/.+\.(png|jpe?g)$/.test(name)); assert(media.length > 0);
  for (const file of media) assert.deepEqual(await zip.file(file).async('nodebuffer'), f.files.get(imageId).bytes, 'Selected bytes stay bit-identical; no extra logo is inserted');
  for (let i = 1; i <= 2; i++) {
    const xml = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
    assert.equal((xml.match(/<p:pic>/g) || []).length, 1); assert(xml.includes(`<p:txBody>`));
    assert(xml.includes(i === 1 ? 'Keep the exact words.' : f.p.scenes[i - 1].screen));
    assert(!xml.includes('<a:srcRect'));
    const geometry = /<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/.exec(xml); assert(geometry);
    assert(Math.abs(Number(geometry[1]) / Number(geometry[2]) - 2) < 0.00001, 'Source aspect ratio is preserved');
    const notes = await zip.file(`ppt/notesSlides/notesSlide${i}.xml`).async('string');
    const expected = f.p.scenes[i - 1].narration.replace(/\r?\n/g, '\r\n'); assert(notes.includes(expected));
  }
  for (const name of Object.keys(zip.files).filter(n => n.endsWith('.rels'))) {
    assert(!/TargetMode="External"/.test(await zip.file(name).async('string')), 'No external image or token URL is linked');
  }
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 1, 'Only one Drive upload mutates Google');
  assert(!f.calls.some(c => /permissions|createImage|batchUpdate/.test(new URL(c.url).pathname)));
});

test('no draft files are read or written during assembly', async () => {
  const f = fixture(), fs = require('node:fs'), originals = {};
  for (const key of ['writeFile', 'writeFileSync', 'createWriteStream', 'readFile', 'readFileSync', 'createReadStream']) { originals[key] = fs[key]; fs[key] = () => { throw new Error(`Unexpected disk I/O: ${key}`); }; }
  try { assert.equal((await createApprovedSlides(f.args())).visualQA, 'PENDING'); }
  finally { for (const [key, fn] of Object.entries(originals)) fs[key] = fn; }
});

test('JPEG source bytes are embedded unchanged, never silently transcoded', async () => {
  const f = fixture(), source = f.addImage(imageId, JPEG, 'image/jpeg');
  f.p.production.imageApproval.images = f.p.production.imageApproval.images.map(im => ({ ...im, ...source }));
  f.p.scenes.forEach(scene => { scene.visual.sha256 = source.sha256; });
  f.p.production.imageApproval.selectionHash = selectionHash(f.p.production.imageApproval);
  await createApprovedSlides(f.args());
  const zip = await JSZip.loadAsync(f.uploads[0].bytes);
  const media = Object.keys(zip.files).filter(name => /^ppt\/media\/.+\.jpe?g$/.test(name)); assert(media.length > 0);
  for (const name of media) assert.deepEqual(await zip.file(name).async('nodebuffer'), JPEG);
});

test('repeated selected images cannot exceed the bounded uncompressed upload budget', async () => {
  const f = fixture(), source = f.addImage(imageId, Buffer.concat([png(), Buffer.alloc(1024 * 1024)]));
  f.p.scenes = Array.from({ length: 60 }, () => ({ ...copy(f.p.scenes[0]), visual: { fileId: imageId, sha256: source.sha256 } }));
  f.p.production.imageApproval.images = f.p.scenes.map((_, sceneIndex) => ({ ...source, sceneIndex }));
  f.p.production.imageApproval.selectionHash = selectionHash(f.p.production.imageApproval);
  await assert.rejects(createApprovedSlides(f.args()), /UPLOAD_TOO_LARGE/); assert.equal(f.uploads.length, 0);
});

test('approval, source hash and exact scene bindings are required before any I/O', async () => {
  const cases = [
    f => { f.p.production.imageApproval = null; },
    f => { f.p.production.imageApproval.approvedBy = 'another-owner'; },
    f => { f.p.production.imageApproval.reference.fileId = 'replacement_logo_1234'; },
    f => { f.p.scenes[0].visual.sha256 = '0'.repeat(64); },
    f => { f.p.production.imageApproval.images[0].sceneIndex = 1; },
    f => { f.p.production.imageApproval.selectionHash = '0'.repeat(64); },
    f => { f.p.visual.version = 'LEGACY_GENERATED_SVG'; },
  ];
  for (const alter of cases) {
    const f = fixture(); alter(f);
    await assert.rejects(createApprovedSlides(f.args()), /FOUNDER_IMAGE_APPROVAL_REQUIRED/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); await assert.rejects(createApprovedSlides({ ...f.args(), expectedHash: '0'.repeat(64) }), /CONTENT_VERSION_CHANGED/); assert.equal(f.calls.length, 0);
});

test('invalid aspect, operation identifiers, text and scene counts fail closed', async () => {
  for (const alter of [f => { f.p.aspectRatio = '1:1'; }, f => { f.p.scenes = []; }, f => { f.p.scenes = Array(61).fill(f.p.scenes[0]); }, f => { f.p.scenes[0].screen = 'x'.repeat(1001); }, f => { f.p.scenes[0].narration = 'x\0'; }]) {
    const f = fixture(); alter(f); await assert.rejects(createApprovedSlides(f.args()), /PACKAGE_INVALID/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); await assert.rejects(createApprovedSlides({ ...f.args(), operationId: "x' or trashed=true" }), /OPERATION_INVALID/);
});

test('owner, account, active connection and both granted scopes are enforced', async () => {
  for (const alter of [f => { f.connection.userId = 'other'; }, f => { f.connection.status = 'reauth_required'; }, f => { f.connection.scopes.pop(); }, f => { f.connection.scopes.shift(); }]) {
    const f = fixture(); alter(f); await assert.rejects(createApprovedSlides(f.args()), /GOOGLE_SLIDES_AUTH_REQUIRED/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.connection.accountEmail = 'personal@example.com';
  await assert.rejects(createApprovedSlides(f.args()), /ACCOUNT_MISMATCH/); assert.equal(f.calls.length, 0);
  const other = fixture(); other.about.user.emailAddress = 'different-token@example.com';
  await assert.rejects(createApprovedSlides(other.args()), /ACCOUNT_MISMATCH/); assert.equal(other.uploads.length, 0);
});

test('private canonical Organic folder and import capability are required', async () => {
  for (const alter of [
    f => { f.files.get(folderId).meta.permissions.push({ type: 'anyone', role: 'reader' }); },
    f => { f.files.get(folderId).meta.permissions.push({ type: 'user', role: 'reader', emailAddress: 'other@example.com' }); },
    f => { f.files.get(folderId).meta.owners[0].me = false; },
    f => { f.files.get(folderId).meta.name = 'Not Organic'; },
    f => { f.files.get(folderId).meta.parents = ['wrong_factory_12345']; },
    f => { f.files.get(folderId).meta.capabilities.canEdit = false; },
    f => { f.connection.metadata.canonicalStorage.provider = 'OTHER'; },
    f => { f.about.importFormats = {}; },
  ]) { const f = fixture(); alter(f); await assert.rejects(createApprovedSlides(f.args()), e => e.uploadAttempted === false && e.outcomeUnknown === false); assert.equal(f.uploads.length, 0); }
});

test('image and original-logo metadata and authenticated bytes must match approved checksums', async () => {
  for (const id of [ORIGINAL_LOGO_FILE_ID, imageId]) {
    const f = fixture(); f.files.get(id).bytes = png(8, 4, 200);
    f.files.get(id).meta.size = String(f.files.get(id).bytes.length); // Deliberately keep old advertised hash.
    await assert.rejects(createApprovedSlides(f.args()), /APPROVED_IMAGE_CHANGED/); assert.equal(f.uploads.length, 0);
  }
  for (const alter of [
    f => { f.files.get(imageId).meta.permissions = [{ type: 'domain', role: 'reader' }]; },
    f => { f.files.get(imageId).meta.capabilities.canDownload = false; },
    f => { f.files.get(imageId).meta.size = String(MAX_IMAGE_BYTES + 1); },
    f => { f.files.get(imageId).meta.mimeType = 'image/webp'; },
    f => { f.files.get(imageId).meta.sha256Checksum = '0'.repeat(64); },
  ]) { const f = fixture(); alter(f); await assert.rejects(createApprovedSlides(f.args())); assert.equal(f.uploads.length, 0); }
});

test('reject malformed raster bytes rather than silently generating substitutes', async () => {
  const f = fixture(), changed = f.addImage(imageId, Buffer.from('<svg>not a png</svg>'));
  f.p.production.imageApproval.images = f.p.production.imageApproval.images.map(im => ({ ...im, sha256: changed.sha256 }));
  f.p.scenes.forEach(scene => { scene.visual.sha256 = changed.sha256; });
  f.p.production.imageApproval.selectionHash = selectionHash(f.p.production.imageApproval);
  await assert.rejects(createApprovedSlides(f.args()), /IMAGE_FORMAT_REQUIRED/); assert.equal(f.uploads.length, 0);
});

test('streaming download size cap is enforced even without a Content-Length header', async () => {
  const f = fixture(); f.options.onRequest = u => u.searchParams.get('alt') === 'media' && u.pathname.endsWith(imageId)
    ? new Response(Buffer.alloc(Number(f.files.get(imageId).meta.size) + 1)) : null;
  await assert.rejects(createApprovedSlides(f.args()), /RESPONSE_TOO_LARGE/); assert.equal(f.uploads.length, 0);
});

test('lookup reconciliation does not upload a second presentation', async () => {
  const f = fixture(), first = await createApprovedSlides(f.args());
  const second = await createApprovedSlides({ ...f.args(), allowCreate: false });
  assert.equal(second.presentationId, first.presentationId); assert.equal(second.reconciled, true); assert.equal(f.uploads.length, 1);
});

test('default and explicit reconciliation cannot create when lookup is empty', async () => {
  for (const defaulted of [true, false]) {
    const f = fixture(), args = f.args(); if (defaulted) delete args.allowCreate; else args.allowCreate = false;
    await assert.rejects(createApprovedSlides(args), e => e.message === 'GOOGLE_SLIDES_OUTCOME_UNCERTAIN' && e.outcomeUnknown === true);
    assert.equal(f.uploads.length, 0);
  }
});

test('lost upload response is marked uncertain and recovered by read-only operation lookup', async () => {
  const f = fixture(); f.options.loseResponse = true;
  await assert.rejects(createApprovedSlides(f.args()), e => e.outcomeUnknown === true && e.uploadAttempted === true && e.operationId === f.args().operationId);
  assert.equal(f.uploads.length, 1);
  assert.equal((await createApprovedSlides({ ...f.args(), allowCreate: false })).reconciled, true);
  assert.equal(f.uploads.length, 1);
});

test('lost response with no visible operation remains uncertain, never blindly retried', async () => {
  const f = fixture(); f.options.loseResponse = true; f.options.skipCreate = true;
  await assert.rejects(createApprovedSlides(f.args()), e => e.outcomeUnknown === true);
  await assert.rejects(createApprovedSlides({ ...f.args(), allowCreate: false }), /OUTCOME_UNCERTAIN/);
  assert.equal(f.uploads.length, 1);
});

test('operation lookup rejects duplicates, partial listings and mismatched identity', async () => {
  for (const change of [
    f => { const meta = copy(f.files.get('converted_slides_123456').meta); meta.id = 'duplicate_slides_12345'; f.files.set(meta.id, { meta }); },
    f => { f.options.lookup = { nextPageToken: 'more' }; },
    f => { f.files.get('converted_slides_123456').meta.appProperties.owner = 'another-owner'; },
    f => { f.files.get('converted_slides_123456').meta.appProperties.selectionHash = '0'.repeat(64); },
    f => { f.files.get('converted_slides_123456').meta.parents = ['other_folder_12345']; },
  ]) {
    const f = fixture(); await createApprovedSlides(f.args()); change(f);
    await assert.rejects(createApprovedSlides(f.args()), e => /OPERATION_(AMBIGUOUS|MISMATCH)/.test(e.message) && e.outcomeUnknown === true); assert.equal(f.uploads.length, 1);
  }
});

test('post-upload privacy failures retain uncertainty without moving or deleting the file', async () => {
  const f = fixture(); f.options.afterUpload = file => { file.meta.permissions.push({ type: 'anyone', role: 'reader' }); };
  await assert.rejects(createApprovedSlides(f.args()), e => e.message === 'GOOGLE_SLIDES_PRIVATE_OWNER_REQUIRED' && e.outcomeUnknown === true && e.presentationId === 'converted_slides_123456');
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 1);
});

test('structural readback rejects changed count, ratio, image geometry, copy and narration', async () => {
  const changes = [
    p => { p.slides.pop(); }, p => { p.pageSize.width.magnitude = 400; },
    p => { p.slides[0].pageElements.shift(); },
    p => { p.slides[0].pageElements[0].image.imageProperties.cropProperties = { leftOffset: 0.1 }; },
    p => { p.slides[0].pageElements[0].transform.scaleX = 1.4; },
    p => { p.slides[0].pageElements[0].transform.translateX = 900; },
    p => { p.slides[0].pageElements[1].shape.text.textElements[0].textRun.content = 'Changed copy\n'; },
    p => { p.slides[0].slideProperties.notesPage.pageElements[0].shape.text.textElements[0].textRun.content = 'Changed narration\n'; },
    p => { delete p.slides[0].slideProperties.notesPage.notesProperties; },
  ];
  for (const alter of changes) {
    const f = fixture(); f.options.alterSlides = alter;
    await assert.rejects(createApprovedSlides(f.args()), e => e.outcomeUnknown === true && /GOOGLE_SLIDES_/.test(e.message));
    assert.equal(f.uploads.length, 1);
  }
});

test('Google soft line breaks preserve equivalent screen copy and exact narration', async () => {
  const f = fixture();
  f.p.scenes[0].narration = 'Synthetic test only. No creative approval or publication.\n\nExact narration paragraph.  ';
  f.options.alterSlides = presentation => {
    const slide = presentation.slides[0];
    slide.pageElements[1].shape.text.textElements[0].textRun.content = `${f.p.scenes[0].screen.replace(/\n/g, '\u000b')}\n`;
    slide.slideProperties.notesPage.pageElements[0].shape.text.textElements[0].textRun.content = `${f.p.scenes[0].narration.replace(/\n/g, '\u000b')}\n`;
  };
  const result = await createApprovedSlides(f.args());
  assert.equal(result.structuralQA, 'PASS'); assert.equal(result.visualQA, 'PENDING');
});

test('Google soft line breaks do not hide changed break counts, whitespace or words', async () => {
  const changes = [
    text => text.replace('\u000b\u000b', '\u000b'),
    text => text.replace('\u000b\u000b', '\u000b\u000b\u000b'),
    text => text.replace('  \n', ' \n'),
    text => text.replace('  \n', '   \n'),
    text => text.replace('Exact narration', 'Exact  narration'),
    text => text.replace('Exact narration', 'Changed narration'),
    text => `${text}\n`,
  ];
  for (const change of changes) {
    const f = fixture();
    f.p.scenes[0].narration = 'Synthetic test only. No creative approval or publication.\n\nExact narration paragraph.  ';
    f.options.alterSlides = presentation => {
      presentation.slides[0].slideProperties.notesPage.pageElements[0].shape.text.textElements[0].textRun.content =
        change(`${f.p.scenes[0].narration.replace(/\n/g, '\u000b')}\n`);
    };
    await assert.rejects(createApprovedSlides(f.args()), /GOOGLE_SLIDES_NOTES_MISMATCH/);
  }
});

test('caller cannot mutate source package while asynchronous verification is pending', async () => {
  const f = fixture(); let changed = false;
  f.options.onRequest = u => {
    if (!changed && u.pathname === '/drive/v3/about') { changed = true; f.p.title = 'Mutated later'; }
    return null;
  };
  const initial = f.args(), result = await createApprovedSlides(initial);
  assert.equal(result.sourceHash, initial.expectedHash); assert.equal(f.uploads[0].meta.name, 'DRAFT - Exact approved scene draft');
});
