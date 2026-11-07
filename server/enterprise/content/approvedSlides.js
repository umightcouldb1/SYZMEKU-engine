'use strict';

const crypto = require('node:crypto');
const PptxGenJS = require('pptxgenjs');
const { hash } = require('./qa');
const { selectionHash, VERSION } = require('./driveVisual');
const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID, validId } = require('./driveMedia');

const KIND = 'C0_APPROVED_IMAGE_SLIDES_V1';
const PRESENTATION_MIME = 'application/vnd.google-apps.presentation';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const FILE_FIELDS = 'id,name,mimeType,trashed,parents,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canEdit,canDownload),appProperties,size,sha256Checksum';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHA256 = /^[a-f0-9]{64}$/;
const fail = (code, statusCode = 409, extra = {}) => { throw Object.assign(new Error(code), { statusCode, ...extra }); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sameEmail = value => typeof value === 'string' && value.toLowerCase() === BUSINESS_ACCOUNT;
const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,96}$/.test(value);
const validText = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);

function snapshotPackage(input, owner, expectedHash) {
  let p;
  try {
    const serialized = JSON.stringify(input);
    if (Buffer.byteLength(serialized) > MAX_JSON_BYTES) fail('GOOGLE_SLIDES_PACKAGE_TOO_LARGE', 413);
    p = JSON.parse(serialized);
  } catch (e) {
    if (e.statusCode) throw e;
    fail('GOOGLE_SLIDES_PACKAGE_INVALID', 400);
  }
  if (!SHA256.test(expectedHash || '') || hash(p) !== expectedHash) fail('CONTENT_VERSION_CHANGED');
  if (!validText(p?.title, 160) || !['9:16', '16:9'].includes(p.aspectRatio) ||
      !Array.isArray(p.scenes) || p.scenes.length < 1 || p.scenes.length > 60 ||
      p.scenes.some(s => !validText(s?.screen, 1000) || !validText(s?.narration, 12000))) fail('GOOGLE_SLIDES_PACKAGE_INVALID', 400);
  const approval = p.production?.imageApproval;
  if (p.visual?.version !== VERSION || p.visual.status !== 'FOUNDER_IMAGES_APPROVED' ||
      !approval || String(approval.approvedBy) !== owner || !Number.isFinite(Date.parse(approval.approvedAt)) ||
      approval.reference?.fileId !== ORIGINAL_LOGO_FILE_ID || !SHA256.test(approval.reference?.sha256 || '') ||
      p.visual.reference?.fileId !== approval.reference.fileId || p.visual.reference?.sha256 !== approval.reference.sha256 ||
      !Array.isArray(approval.images) || approval.images.length !== p.scenes.length ||
      approval.images.some((im, i) => im.sceneIndex !== i || !validId(im.fileId) || !SHA256.test(im.sha256 || '') ||
        p.scenes[i].visual?.fileId !== im.fileId || p.scenes[i].visual?.sha256 !== im.sha256) ||
      approval.selectionHash !== selectionHash(approval)) fail('FOUNDER_IMAGE_APPROVAL_REQUIRED');
  return p;
}

function assertPrivate(meta, mimeType, editable = false) {
  if (meta?.trashed !== false || meta.mimeType !== mimeType || meta.owners?.length !== 1 ||
      meta.owners[0].me !== true || !sameEmail(meta.owners[0].emailAddress) ||
      !Array.isArray(meta.permissions) || !meta.permissions.length ||
      meta.permissions.some(p => p.type !== 'user' || p.role !== 'owner' || !sameEmail(p.emailAddress)) ||
      (editable && meta.capabilities?.canEdit !== true)) fail('GOOGLE_SLIDES_PRIVATE_OWNER_REQUIRED');
}

// Read just raster dimensions. No decoding, recompression, crop or disk staging.
function imageDimensions(bytes, mimeType) {
  let width, height;
  if (mimeType === 'image/png' && bytes.length >= 33 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (mimeType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos < bytes.length) {
      if (bytes[pos++] !== 0xff) break;
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xd9 || marker === 0xda || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (pos + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(pos);
      if (length < 2 || pos + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(pos + 3); width = bytes.readUInt16BE(pos + 5); break;
      }
      pos += length;
    }
  }
  if (!width || !height || width > 32768 || height > 32768 || width * height > 80 * 1000 * 1000) fail('GOOGLE_SLIDES_IMAGE_FORMAT_REQUIRED', 400);
  return { width, height };
}

function layoutFor(aspectRatio) {
  return aspectRatio === '9:16'
    ? { width: 7.5, height: 40 / 3, image: { x: 0.4, y: 0.4, w: 6.7, h: 8.5 }, text: { x: 0.5, y: 9.2, w: 6.5, h: 3.6 }, fontSize: 32 }
    : { width: 40 / 3, height: 7.5, image: { x: 0.4, y: 0.4, w: 8.2, h: 6.7 }, text: { x: 8.95, y: 0.5, w: 3.95, h: 6.5 }, fontSize: 30 };
}

async function buildPptx(p, images) {
  const pptx = new PptxGenJS(), layout = layoutFor(p.aspectRatio);
  pptx.defineLayout({ name: 'APPROVED_SCENES', width: layout.width, height: layout.height });
  pptx.layout = 'APPROVED_SCENES';
  pptx.author = 'T.O.I. Souljah Academy'; pptx.subject = 'Approval draft'; pptx.title = p.title;
  pptx.lang = 'en-US';
  for (let i = 0; i < p.scenes.length; i++) {
    const scene = p.scenes[i], asset = images.get(p.production.imageApproval.images[i].fileId);
    const slide = pptx.addSlide(); slide.background = { color: '080A09' };
    const scale = Math.min(layout.image.w / asset.width, layout.image.h / asset.height);
    const w = asset.width * scale, h = asset.height * scale;
    slide.addImage({ data: `data:${asset.mimeType};base64,${asset.bytes.toString('base64')}`,
      x: layout.image.x + (layout.image.w - w) / 2, y: layout.image.y + (layout.image.h - h) / 2, w, h,
      altText: `Approved scene ${i + 1}; SHA-256 ${asset.sha256}`, objectName: `approved_scene_${i}` });
    // This is native editable copy, separate from the unaltered selected image.
    slide.addText(scene.screen, { ...layout.text, fontFace: 'Arial', fontSize: layout.fontSize,
      bold: true, color: 'F4F5F4', margin: 0, valign: 'mid', breakLine: false,
      fit: 'shrink', objectName: `scene_copy_${i}`, paraSpaceAfterPt: 0 });
    slide.addNotes(scene.narration);
  }
  const bytes = await pptx.write({ outputType: 'nodebuffer', compression: true });
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_UPLOAD_BYTES) fail('GOOGLE_SLIDES_UPLOAD_TOO_LARGE', 413);
  return bytes;
}

const points = dimension => dimension?.unit === 'PT' ? dimension.magnitude : dimension?.unit === 'EMU' ? dimension.magnitude / 12700 : NaN;
const textOf = element => (element?.shape?.text?.textElements || []).map(run => run.textRun?.content || '').join('');
const exactText = (actual, expected) => {
  const a = actual.replace(/\r\n/g, '\n'), e = expected.replace(/\r\n/g, '\n');
  // Google Shapes include a required final paragraph newline. Do not trim spaces
  // or otherwise normalize content: that could conceal a changed narration.
  return a === e || a === `${e}\n`;
};
function verifyPresentation(presentation, id, p, images) {
  if (presentation?.presentationId !== id || presentation.slides?.length !== p.scenes.length) fail('GOOGLE_SLIDES_STRUCTURE_MISMATCH');
  const width = points(presentation.pageSize?.width), height = points(presentation.pageSize?.height);
  const ratio = p.aspectRatio === '9:16' ? 9 / 16 : 16 / 9;
  if (!(width > 0 && height > 0) || Math.abs(width / height - ratio) > 0.001) fail('GOOGLE_SLIDES_ASPECT_MISMATCH');
  presentation.slides.forEach((slide, i) => {
    const elements = slide.pageElements || [], imageElements = elements.filter(e => e.image);
    const textElements = elements.filter(e => e.shape);
    if (elements.length !== 2 || imageElements.length !== 1 || textElements.length !== 1 ||
        !exactText(textOf(textElements[0]), p.scenes[i].screen)) fail('GOOGLE_SLIDES_STRUCTURE_MISMATCH');
    const image = imageElements[0], crop = image.image.imageProperties?.cropProperties || {};
    if (Object.values(crop).some(value => typeof value !== 'number' || Math.abs(value) > 0.00001)) fail('GOOGLE_SLIDES_IMAGE_CROPPED');
    const transform = image.transform || {}, scaleX = transform.scaleX, scaleY = transform.scaleY;
    const w = points(image.size?.width) * scaleX, h = points(image.size?.height) * scaleY;
    const unit = transform.unit, x = points({ magnitude: transform.translateX || 0, unit }), y = points({ magnitude: transform.translateY || 0, unit });
    const asset = images.get(p.production.imageApproval.images[i].fileId);
    if (!(scaleX > 0 && scaleY > 0 && w > 0 && h > 0) || !Number.isFinite(x) || !Number.isFinite(y) ||
        Math.abs(transform.shearX || 0) > 0.00001 || Math.abs(transform.shearY || 0) > 0.00001 ||
        Math.abs(w / h / (asset.width / asset.height) - 1) > 0.01 || x < -0.5 || y < -0.5 || x + w > width + 0.5 || y + h > height + 0.5) fail('GOOGLE_SLIDES_IMAGE_GEOMETRY_MISMATCH');
    const notes = slide.slideProperties?.notesPage, notesId = notes?.notesProperties?.speakerNotesObjectId;
    const body = notes?.pageElements?.find(e => e.objectId === notesId);
    if (!notesId || !body?.shape || !exactText(textOf(body), p.scenes[i].narration)) fail('GOOGLE_SLIDES_NOTES_MISMATCH');
  });
}

/**
 * The caller owns a durable CAS job keyed by operationId BEFORE calling this.
 * allowCreate:true is allowed once only. Every retry must use allowCreate:false,
 * including process crashes and lost responses. An absent lookup is not proof an
 * upload never happened. This adapter never retries writes or changes sharing.
 * All content bytes exist only in memory and the authenticated private Drive.
 */
async function assembleApprovedSlides({ owner, itemId, package: input, expectedHash, operationId,
  workspaceImpl, mediaReader, fetchImpl = fetch, allowCreate = false }) {
  if (!validKey(owner) || !validKey(itemId) || !validKey(operationId) || typeof allowCreate !== 'boolean') fail('GOOGLE_SLIDES_OPERATION_INVALID', 400);
  const p = snapshotPackage(input, owner, expectedHash), approval = p.production.imageApproval;
  let fresh;
  try { fresh = await (workspaceImpl || require('./workspaceConnection')).getFreshAccessToken({ owner }); }
  catch { fail('GOOGLE_SLIDES_AUTH_REQUIRED'); }
  const { connection, accessToken } = fresh || {};
  if (String(connection?.userId) !== owner || connection?.status !== 'connected' || !accessToken ||
      !['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/presentations'].every(s => connection.scopes?.includes(s))) fail('GOOGLE_SLIDES_AUTH_REQUIRED');
  if (!sameEmail(connection.accountEmail)) fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');

  async function read(url, { limit = MAX_JSON_BYTES, ...options } = {}) {
    let response;
    try { response = await fetchImpl(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(60000) }); }
    catch { fail('GOOGLE_SLIDES_REQUEST_FAILED', 502); }
    if (!response.ok) fail(`GOOGLE_SLIDES_HTTP_${response.status}`, 502);
    if (!response.body?.getReader) fail('GOOGLE_SLIDES_RESPONSE_INVALID', 502);
    if (Number(response.headers?.get('content-length')) > limit) { await response.body.cancel(); fail('GOOGLE_SLIDES_RESPONSE_TOO_LARGE', 413); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); fail('GOOGLE_SLIDES_RESPONSE_TOO_LARGE', 413); }
        chunks.push(Buffer.from(value));
      }
    } catch (e) { if (e.statusCode) throw e; fail('GOOGLE_SLIDES_REQUEST_FAILED', 502); }
    finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  async function json(url, options) {
    const bytes = await read(url, options);
    try { return JSON.parse(bytes.toString('utf8')); } catch { fail('GOOGLE_SLIDES_RESPONSE_INVALID', 502); }
  }
  const metadata = id => json(`${DRIVE}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`);
  const canonical = connection.metadata?.canonicalStorage;
  const folderId = canonical?.folders?.Organic, factoryId = canonical?.contentFactoryFolderId;
  if (canonical?.provider !== 'GOOGLE_DRIVE' || !validId(folderId) || !validId(factoryId)) fail('GOOGLE_SLIDES_FOLDER_REQUIRED');
  async function verifyFolder() {
    const folder = await metadata(folderId);
    assertPrivate(folder, 'application/vnd.google-apps.folder', true);
    if (folder.id !== folderId || folder.name !== 'Organic' || folder.parents?.length !== 1 || folder.parents[0] !== factoryId) fail('GOOGLE_SLIDES_FOLDER_REQUIRED');
  }
  await verifyFolder();
  const about = await json(`${DRIVE}/about?fields=${encodeURIComponent('user(emailAddress,me),importFormats')}`);
  if (!sameEmail(about.user?.emailAddress) || about.user.me !== true) fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');
  if (!about.importFormats?.[PPTX_MIME]?.includes(PRESENTATION_MIME)) fail('GOOGLE_SLIDES_IMPORT_UNSUPPORTED');

  const properties = { kind: KIND, owner, itemId, sourceHash: expectedHash, selectionHash: approval.selectionHash, operationId };
  const query = `trashed=false and appProperties has { key='kind' and value='${KIND}' } and appProperties has { key='operationId' and value='${operationId}' }`;
  const lookup = await json(`${DRIVE}/files?q=${encodeURIComponent(query)}&pageSize=100&fields=${encodeURIComponent(`files(${FILE_FIELDS}),nextPageToken`)}`);
  if (!Array.isArray(lookup.files) || lookup.nextPageToken || lookup.files.length > 1 ||
      (lookup.files.length === 1 && !validId(lookup.files[0]?.id))) fail('GOOGLE_SLIDES_OPERATION_AMBIGUOUS', 409, { outcomeUnknown: true, operationId });
  let outputId = lookup.files[0]?.id;
  function verifyOutput(meta) {
    assertPrivate(meta, PRESENTATION_MIME, true);
    if (!validId(meta.id) || meta.id !== outputId || meta.parents?.length !== 1 || meta.parents[0] !== folderId ||
        Object.entries(properties).some(([key, value]) => meta.appProperties?.[key] !== value)) fail('GOOGLE_SLIDES_OPERATION_MISMATCH');
  }
  let uploadAttempted = false;
  try {
    if (outputId) verifyOutput(lookup.files[0]);
    else if (!allowCreate) fail('GOOGLE_SLIDES_OUTCOME_UNCERTAIN', 409, { outcomeUnknown: true, operationId });

    const images = new Map(); let totalBytes = 0, embeddedBytes = 0;
    for (const approved of [approval.reference, ...approval.images]) {
      const existing = images.get(approved.fileId);
      if (existing) { if (existing.sha256 !== approved.sha256) fail('APPROVED_IMAGE_CHANGED'); continue; }
      if (mediaReader) {
        const inspected = await mediaReader.inspect(approved.fileId, 'image');
        if (inspected.fileId !== approved.fileId || inspected.sha256 !== approved.sha256) fail('APPROVED_IMAGE_CHANGED');
      }
      const meta = await metadata(approved.fileId);
      if (!['image/png', 'image/jpeg'].includes(meta.mimeType)) fail('GOOGLE_SLIDES_PNG_JPEG_REQUIRED', 400);
      assertPrivate(meta, meta.mimeType);
      if (meta.id !== approved.fileId || meta.capabilities?.canDownload !== true ||
          (approved.mimeType && approved.mimeType !== meta.mimeType)) fail('GOOGLE_SLIDES_IMAGE_METADATA_MISMATCH');
      const size = Number(meta.size);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) fail('GOOGLE_SLIDES_IMAGE_TOO_LARGE', 413);
      if (totalBytes + size > MAX_UPLOAD_BYTES) fail('GOOGLE_SLIDES_UPLOAD_TOO_LARGE', 413);
      if (meta.sha256Checksum && meta.sha256Checksum !== approved.sha256) fail('APPROVED_IMAGE_CHANGED');
      const bytes = await read(`${DRIVE}/files/${approved.fileId}?alt=media`, { limit: Math.min(size, MAX_IMAGE_BYTES) });
      if (bytes.length !== size || digest(bytes) !== approved.sha256) fail('APPROVED_IMAGE_CHANGED');
      totalBytes += bytes.length;
      images.set(approved.fileId, { bytes, mimeType: meta.mimeType, sha256: approved.sha256, ...imageDimensions(bytes, meta.mimeType) });
    }
    // PptxGenJS can embed a repeated selection more than once. Bound the worst
    // uncompressed media total before constructing the ZIP, not just its result.
    for (const approved of approval.images) embeddedBytes += images.get(approved.fileId).bytes.length;
    if (embeddedBytes > MAX_UPLOAD_BYTES - 1024 * 1024) fail('GOOGLE_SLIDES_UPLOAD_TOO_LARGE', 413);

    if (!outputId) {
      const bytes = await buildPptx(p, images);
      await verifyFolder(); // Recheck inherited privacy immediately before create.
      const boundary = `approved_slides_${crypto.randomUUID()}`;
      const meta = { name: `DRAFT - ${p.title}`, mimeType: PRESENTATION_MIME, parents: [folderId], appProperties: properties };
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      if (body.length > MAX_UPLOAD_BYTES) fail('GOOGLE_SLIDES_UPLOAD_TOO_LARGE', 413);
      uploadAttempted = true;
      const uploaded = await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      if (!validId(uploaded.id)) fail('GOOGLE_SLIDES_RESPONSE_INVALID', 502);
      outputId = uploaded.id;
    }
    verifyOutput(await metadata(outputId));
    // No contentUrl/image URL is ever followed. The Slides read proves structure,
    // not the visual fidelity of Google's format conversion.
    const presentation = await json(`https://slides.googleapis.com/v1/presentations/${outputId}`);
    verifyPresentation(presentation, outputId, p, images);
    verifyOutput(await metadata(outputId));
    return { presentationId: outputId, url: `https://docs.google.com/presentation/d/${outputId}/edit`,
      sourceHash: expectedHash, selectionHash: approval.selectionHash, operationId,
      status: 'SLIDES_DRAFT_CREATED', storage: 'GOOGLE_DRIVE', structuralQA: 'PASS', visualQA: 'PENDING',
      approval: 'FOUNDER_REVIEW_REQUIRED', videoApproval: false,
      imageIntegrity: 'APPROVED_SOURCE_BYTES_VERIFIED; GOOGLE_CONVERSION_VISUAL_REVIEW_REQUIRED',
      reconciled: !uploadAttempted };
  } catch (e) {
    if (uploadAttempted || outputId) {
      e.uploadAttempted = uploadAttempted; e.outcomeUnknown = true; e.operationId = operationId;
      if (outputId) e.presentationId = outputId;
    }
    throw e;
  }
}

async function createApprovedSlides(args) {
  try { return await assembleApprovedSlides(args); }
  catch (e) {
    // Literal false/false identifies a known no-upload preflight failure. On a
    // reconciliation request, absence of evidence never clears a prior attempt.
    if (typeof e.uploadAttempted !== 'boolean') e.uploadAttempted = false;
    if (typeof e.outcomeUnknown !== 'boolean') e.outcomeUnknown = args?.allowCreate !== true;
    throw e;
  }
}

module.exports = { createApprovedSlides, KIND, PRESENTATION_MIME, PPTX_MIME, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES };
