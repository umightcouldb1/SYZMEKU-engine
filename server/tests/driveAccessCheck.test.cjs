'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { checkExistingDriveAccess, DRIVE_SCOPE, SLIDES_SCOPE, MAX_LOGO_BYTES } = require('../enterprise/content/driveAccessCheck');
const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID } = require('./contentPrivateConfigFixture.cjs');

const owner = '1234567890abcdef12345678';
const rootId = 'root_folder_123456', factoryId = 'factory_folder_123456', organicId = 'organic_folder_123456';
const secret = 'SYNTHETIC_ACCESS_TOKEN_NEVER_RETURN';
const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const bytes = Buffer.from('synthetic original logo bytes'), calls = [], files = new Map(), options = {};
  const privateMeta = (id, name, mimeType) => ({ id, name, mimeType, trashed: false,
    owners: [{ emailAddress: BUSINESS_ACCOUNT, me: true }], permissions: [{ type: 'user', role: 'owner', emailAddress: BUSINESS_ACCOUNT }],
    capabilities: { canEdit: true, canDownload: true } });
  files.set(rootId, { ...privateMeta(rootId, 'T.O.I. Souljah Academy', 'application/vnd.google-apps.folder'), parents: ['my_drive_root_12345'] });
  files.set(factoryId, { ...privateMeta(factoryId, 'Content Factory', 'application/vnd.google-apps.folder'), parents: [rootId] });
  files.set(organicId, { ...privateMeta(organicId, 'Organic', 'application/vnd.google-apps.folder'), parents: [factoryId] });
  files.set(ORIGINAL_LOGO_FILE_ID, { ...privateMeta(ORIGINAL_LOGO_FILE_ID, 'Untrusted name never returned', 'image/png'), size: String(bytes.length), sha256Checksum: checksum(bytes), version: '34' });
  const connection = { userId: owner, status: 'connected', accountEmail: BUSINESS_ACCOUNT, scopes: ['openid', 'email', 'profile', DRIVE_SCOPE, SLIDES_SCOPE],
    metadata: { canonicalStorage: { provider: 'GOOGLE_DRIVE', rootFolderId: rootId, contentFactoryFolderId: factoryId, folders: { Organic: organicId } } } };
  const about = { user: { emailAddress: BUSINESS_ACCOUNT, me: true } }, helperCalls = [];
  const workspaceImpl = {
    getFreshAccessToken: async args => { helperCalls.push(copy(args)); if (options.refreshError) throw options.refreshError; options.afterRefresh?.(); return { connection: options.freshConnection || connection, accessToken: options.token === undefined ? secret : options.token }; },
    getStatus: () => { throw new Error('Must not invoke status verifier'); },
    ensureDriveHierarchy: () => { throw new Error('Must not create or replace folders'); },
    beginAuthorization: () => { throw new Error('Must not reconnect or expand scope'); },
  };
  const readConnectionImpl = async id => { assert.equal(id, owner); if (options.readError) throw options.readError; return options.missing ? null : connection; };
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, init });
    const u = new URL(url);
    assert.equal(u.origin, 'https://www.googleapis.com'); assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, `Bearer ${secret}`); assert.equal(init.redirect, 'error'); assert(init.signal instanceof AbortSignal);
    assert.equal(init.body, undefined); assert(!url.includes(secret)); assert(!u.searchParams.has('q'));
    if (options.onRequest) { const response = await options.onRequest(u, init); if (response) return response; }
    if (u.pathname === '/drive/v3/about') return Response.json(about);
    assert(u.pathname.startsWith('/drive/v3/files/'), 'Only exact resource reads are allowed');
    const id = u.pathname.split('/').at(-1), meta = files.get(id);
    assert(meta, `Unexpected file ${id}`);
    if (u.searchParams.get('alt') === 'media') { assert.equal(id, ORIGINAL_LOGO_FILE_ID); return new Response(bytes); }
    return Response.json(meta);
  };
  const args = () => ({ owner, workspaceImpl, readConnectionImpl, fetchImpl });
  return { bytes, calls, files, options, connection, about, helperCalls, args };
}
const check = (report, id) => report.checks.find(item => item.id === id);
async function expectFailure(f, id, code) {
  const result = await checkExistingDriveAccess(f.args());
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.ready, false); assert.equal(check(result, id).status, 'FAIL'); assert.equal(check(result, id).code, code);
  return result;
}

test('verifies only existing app token, private canonical chain and exact downloaded original; no writes or connection mutations', async () => {
  const f = fixture(), before = copy(f.connection), result = await checkExistingDriveAccess(f.args());
  assert.equal(result.status, 'PASS'); assert.equal(result.ready, true); assert.equal(result.productionReady, false);
  assert.equal(result.scopeEvidence, 'EXISTING_CONNECTION_RECORD'); assert.equal(result.accessEvidence, 'THIS_APP_TOKEN_ONLY');
  assert.equal(result.driveWritesAttempted, false); assert.equal(result.scopeExpansionAttempted, false);
  assert(result.checks.every(item => item.status === 'PASS'));
  assert.deepEqual(f.helperCalls, [{ owner }]); assert.deepEqual(f.connection, before);
  assert.equal(check(result, 'originalLogo').sha256, checksum(f.bytes)); assert.equal(check(result, 'originalLogo').fileId, ORIGINAL_LOGO_FILE_ID);
  assert.equal(f.calls.length, 7); assert(f.calls.every(call => call.method === 'GET'));
  assert.equal(f.calls.filter(call => call.url.includes('alt=media')).length, 1, 'Bytes are read even when metadata has a checksum');
  const output = JSON.stringify(result);
  for (const forbidden of [secret, 'Untrusted name', 'encryptedAccessToken', 'encryptedRefreshToken', 'webViewLink']) assert(!output.includes(forbidden));
});

test('requires valid authenticated owner before reading or refreshing connection', async () => {
  const f = fixture();
  for (const invalid of [undefined, null, '', { id: owner }, '../12345', 'x'.repeat(161)]) {
    const report = await checkExistingDriveAccess({ ...f.args(), owner: invalid }); assert.equal(check(report, 'connection').code, 'OWNER_REQUIRED');
  }
  assert.equal(f.helperCalls.length, 0); assert.equal(f.calls.length, 0);
});

test('missing, revoked, different-owner and personal connections fail before token refresh', async () => {
  for (const [alter, expected] of [
    [f => { f.options.missing = true; }, 'CONNECTION_MISSING'],
    [f => { f.connection.status = 'revoked'; }, 'CONNECTION_REAUTH_REQUIRED'],
    [f => { f.connection.status = 'reauth_required'; }, 'CONNECTION_REAUTH_REQUIRED'],
    [f => { f.connection.userId = 'another_owner'; }, 'CONNECTION_OWNER_MISMATCH'],
    [f => { f.connection.accountEmail = 'private-personal@example.invalid'; }, 'BUSINESS_ACCOUNT_MISMATCH'],
  ]) {
    const f = fixture(); alter(f); const report = await expectFailure(f, 'connection', expected);
    assert.equal(f.helperCalls.length, 0); assert.equal(f.calls.length, 0); assert(!JSON.stringify(report).includes('private-personal'));
  }
});

test('both existing narrow Drive and Slides scope records are required; broad Drive is not substituted', async () => {
  for (const [scopes, expected] of [
    [[], 'DRIVE_FILE_SCOPE_MISSING'], [[SLIDES_SCOPE], 'DRIVE_FILE_SCOPE_MISSING'],
    [['https://www.googleapis.com/auth/drive', SLIDES_SCOPE], 'DRIVE_FILE_SCOPE_MISSING'],
    [[DRIVE_SCOPE], 'PRESENTATIONS_SCOPE_MISSING'], [DRIVE_SCOPE, 'DRIVE_FILE_SCOPE_MISSING'],
  ]) {
    const f = fixture(); f.connection.scopes = scopes; await expectFailure(f, 'scopes', expected);
    assert.equal(f.helperCalls.length, 0); assert.equal(f.calls.length, 0);
  }
});

test('missing, duplicate and invalid canonical IDs never trigger folder lookup/create', async () => {
  for (const alter of [
    f => { delete f.connection.metadata; }, f => { f.connection.metadata.canonicalStorage.provider = 'OTHER'; },
    f => { delete f.connection.metadata.canonicalStorage.rootFolderId; },
    f => { f.connection.metadata.canonicalStorage.contentFactoryFolderId = 'wrong/id/../../'; },
    f => { f.connection.metadata.canonicalStorage.folders.Organic = rootId; },
  ]) {
    const f = fixture(); alter(f); await expectFailure(f, 'canonicalConfiguration', 'CANONICAL_CONFIGURATION_REQUIRED');
    assert.equal(f.helperCalls.length, 0); assert.equal(f.calls.length, 0);
  }
});

test('revoked refresh grant is distinct from temporary refresh outage without leaking provider text', async () => {
  for (const [error, expected] of [
    [Object.assign(new Error(secret), { providerPayload: { error: 'invalid_grant', error_description: secret } }), 'CONNECTION_REAUTH_REQUIRED'],
    [Object.assign(new Error(secret), { statusCode: 401, config: { token: secret } }), 'CONNECTION_REAUTH_REQUIRED'],
    [new Error('GOOGLE_WORKSPACE_REAUTH_REQUIRED'), 'CONNECTION_REAUTH_REQUIRED'],
    [Object.assign(new Error(secret), { statusCode: 503, providerPayload: { error: secret } }), 'TOKEN_REFRESH_UNAVAILABLE'],
  ]) {
    const f = fixture(); f.options.refreshError = error; const report = await expectFailure(f, 'token', expected);
    assert(!JSON.stringify(report).includes(secret)); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.options.token = ''; await expectFailure(f, 'token', 'CONNECTION_REAUTH_REQUIRED'); assert.equal(f.calls.length, 0);
});

test('connection read failures and changes during refresh fail closed and never expose raw exceptions', async () => {
  const f = fixture(); f.options.readError = new Error(secret);
  assert(!JSON.stringify(await expectFailure(f, 'connection', 'CONNECTION_UNAVAILABLE')).includes(secret)); assert.equal(f.helperCalls.length, 0);
  for (const alter of [
    c => { c.metadata.canonicalStorage.folders.Organic = 'replacement_folder_12345'; },
    c => { c.userId = 'another_owner'; }, c => { c.accountEmail = 'other@example.invalid'; },
    c => { c.scopes = []; }, c => { c.status = 'revoked'; },
  ]) {
    const changed = fixture(); changed.options.freshConnection = copy(changed.connection); alter(changed.options.freshConnection);
    await expectFailure(changed, 'token', 'CONNECTION_CHANGED'); assert.equal(changed.calls.length, 0);
  }
});

test('live token must confirm the private business account before any file is read', async () => {
  for (const alter of [f => { f.about.user.emailAddress = 'different_token@example.invalid'; }, f => { f.about.user.me = false; }, f => { delete f.about.user; }]) {
    const f = fixture(); alter(f); const report = await expectFailure(f, 'businessIdentity', 'BUSINESS_IDENTITY_UNVERIFIED');
    assert.equal(f.calls.length, 1); assert(!JSON.stringify(report).includes('different_token'));
  }
});

test('private ownership and permissions are verified separately on all canonical folders', async () => {
  for (const [fileId, id] of [[rootId, 'rootFolder'], [factoryId, 'contentFactoryFolder'], [organicId, 'organicFolder']]) {
    for (const alter of [
      m => { m.owners = []; }, m => { m.owners[0].me = false; }, m => { m.owners[0].emailAddress = 'other@example.invalid'; },
      m => { m.owners.push(copy(m.owners[0])); }, m => { delete m.permissions; }, m => { m.permissions = []; },
      m => { m.permissions.push({ type: 'anyone', role: 'reader' }); },
      m => { m.permissions.push({ type: 'domain', role: 'reader' }); },
      m => { m.permissions.push({ type: 'user', role: 'reader', emailAddress: BUSINESS_ACCOUNT }); },
      m => { m.permissions.push({ type: 'user', role: 'writer', emailAddress: 'other@example.invalid' }); },
      m => { m.trashed = true; }, m => { delete m.trashed; },
    ]) {
      const f = fixture(); alter(f.files.get(fileId)); await expectFailure(f, id, 'PRIVATE_BUSINESS_OWNER_REQUIRED');
    }
  }
});

test('exact canonical folder IDs, names, type, edit capability and parent chain cannot be substituted', async () => {
  for (const [fileId, id] of [[rootId, 'rootFolder'], [factoryId, 'contentFactoryFolder'], [organicId, 'organicFolder']]) {
    for (const alter of [m => { m.id = 'replacement_folder_123'; }, m => { m.name = 'Renamed'; }, m => { m.mimeType = 'application/vnd.google-apps.shortcut'; }]) {
      const f = fixture(); alter(f.files.get(fileId)); await expectFailure(f, id, 'FOLDER_IDENTITY_MISMATCH');
    }
    const f = fixture(); f.files.get(fileId).capabilities.canEdit = false; await expectFailure(f, id, 'FOLDER_EDIT_ACCESS_REQUIRED');
  }
  for (const [fileId, id] of [[factoryId, 'contentFactoryFolder'], [organicId, 'organicFolder']]) {
    for (const parents of [undefined, [], ['wrong_folder_12345'], [rootId, factoryId]]) {
      const f = fixture(); f.files.get(fileId).parents = parents; await expectFailure(f, id, 'FOLDER_PARENT_MISMATCH');
    }
  }
});

test('original source 403/404 remains a source-access blocker even when all folders are accessible', async () => {
  for (const status of [403, 404]) for (const phase of ['metadata', 'bytes']) {
    const f = fixture();
    f.options.onRequest = u => u.pathname.endsWith(ORIGINAL_LOGO_FILE_ID) && (phase === 'metadata' || u.searchParams.get('alt') === 'media')
      ? Response.json({ error: { message: secret, access_token: secret } }, { status }) : null;
    const report = await expectFailure(f, 'originalLogo', status === 403 ? 'SOURCE_APP_ACCESS_FORBIDDEN' : 'SOURCE_APP_ACCESS_NOT_FOUND');
    assert(['rootFolder', 'contentFactoryFolder', 'organicFolder'].every(id => check(report, id).status === 'PASS'));
    assert.equal(check(report, 'token').status, 'PASS'); assert(!JSON.stringify(report).includes(secret));
    assert.match(check(report, 'originalLogo').message, /selected or opened for this app/);
    assert(!JSON.stringify(report).includes('full Drive')); assert(!JSON.stringify(report).includes('authorizationUrl'));
  }
});

test('folder denial/not-found diagnostics never create folders and source checks remain independent', async () => {
  for (const status of [403, 404]) {
    const f = fixture(); f.options.onRequest = u => u.pathname.endsWith(factoryId) ? Response.json({ secret }, { status }) : null;
    const report = await expectFailure(f, 'contentFactoryFolder', status === 403 ? 'APP_ACCESS_FORBIDDEN' : 'APP_RESOURCE_NOT_FOUND');
    assert.equal(check(report, 'originalLogo').status, 'PASS'); assert(f.calls.every(c => c.method === 'GET'));
  }
});

test('401 is a connection diagnostic, aborts remaining folder reads and is never mistaken for source app access', async () => {
  for (const [path, id] of [['about', 'businessIdentity'], [rootId, 'rootFolder'], [ORIGINAL_LOGO_FILE_ID, 'originalLogo']]) {
    const f = fixture(); f.options.onRequest = u => u.pathname.endsWith(path) ? Response.json({ error: secret }, { status: 401 }) : null;
    await expectFailure(f, id, 'CONNECTION_REAUTH_REQUIRED');
    if (id === 'rootFolder') assert.equal(f.calls.length, 2);
  }
});

test('source must be the exact privately owned image and explicitly downloadable', async () => {
  for (const [alter, expected] of [
    [m => { m.id = 'other_source_12345'; }, 'SOURCE_IDENTITY_MISMATCH'],
    [m => { m.mimeType = 'application/vnd.google-apps.shortcut'; }, 'SOURCE_IDENTITY_MISMATCH'],
    [m => { m.permissions.push({ type: 'anyone', role: 'reader' }); }, 'PRIVATE_BUSINESS_OWNER_REQUIRED'],
    [m => { m.owners[0].emailAddress = 'other@example.invalid'; }, 'PRIVATE_BUSINESS_OWNER_REQUIRED'],
    [m => { m.capabilities.canDownload = false; }, 'SOURCE_DOWNLOAD_REQUIRED'],
    [m => { delete m.capabilities.canDownload; }, 'SOURCE_DOWNLOAD_REQUIRED'],
    [m => { m.size = String(MAX_LOGO_BYTES + 1); }, 'SOURCE_SIZE_INVALID'],
    [m => { m.size = '0'; }, 'SOURCE_SIZE_INVALID'], [m => { m.size = '-1'; }, 'SOURCE_SIZE_INVALID'],
    [m => { m.sha256Checksum = secret; }, 'GOOGLE_RESPONSE_INVALID'],
  ]) {
    const f = fixture(); alter(f.files.get(ORIGINAL_LOGO_FILE_ID)); await expectFailure(f, 'originalLogo', expected);
    assert(!f.calls.some(c => c.url.includes('alt=media')));
  }
});

test('downloaded logo bytes are hashed without storing data, including when metadata omits checksum', async () => {
  const f = fixture(); delete f.files.get(ORIGINAL_LOGO_FILE_ID).sha256Checksum;
  const fs = require('node:fs'), original = {};
  for (const key of ['writeFile', 'writeFileSync', 'createWriteStream']) { original[key] = fs[key]; fs[key] = () => { throw new Error('Unexpected local draft write'); }; }
  try {
    const report = await checkExistingDriveAccess(f.args()); assert.equal(report.status, 'PASS');
    assert.equal(check(report, 'originalLogo').sha256, checksum(f.bytes)); assert(!JSON.stringify(report).includes(f.bytes.toString()));
  } finally { Object.assign(fs, original); }
});

test('changed logo checksum, bytes, size or revision is rejected', async () => {
  for (const kind of ['checksum', 'bytes', 'size', 'version', 'privacy']) {
    const f = fixture();
    if (kind === 'checksum') f.files.get(ORIGINAL_LOGO_FILE_ID).sha256Checksum = '0'.repeat(64);
    f.options.onRequest = u => {
      if (u.pathname.endsWith(ORIGINAL_LOGO_FILE_ID) && u.searchParams.get('alt') === 'media') {
        if (kind === 'bytes') return new Response(Buffer.alloc(f.bytes.length, 0));
        if (kind === 'size') return new Response(f.bytes.subarray(1));
        if (kind === 'version') f.files.get(ORIGINAL_LOGO_FILE_ID).version = '35';
        if (kind === 'privacy') f.files.get(ORIGINAL_LOGO_FILE_ID).permissions.push({ type: 'anyone', role: 'reader' });
      }
      return null;
    };
    await expectFailure(f, 'originalLogo', kind === 'privacy' ? 'PRIVATE_BUSINESS_OWNER_REQUIRED' : 'SOURCE_CHANGED');
  }
});

test('bounded source reads reject oversized stream or Content-Length', async () => {
  for (const mode of ['header', 'stream']) {
    const f = fixture();
    f.options.onRequest = u => u.searchParams.get('alt') === 'media'
      ? new Response(mode === 'header' ? f.bytes : Buffer.alloc(MAX_LOGO_BYTES + 1), { headers: mode === 'header' ? { 'Content-Length': String(MAX_LOGO_BYTES + 1) } : {} }) : null;
    await expectFailure(f, 'originalLogo', 'SOURCE_SIZE_INVALID');
  }
});

test('provider errors, redirect failures, malformed/oversized metadata and stream errors are sanitized', async () => {
  for (const [request, expected] of [
    [() => { throw new Error(`Redirect to https://elsewhere.invalid/?token=${secret}`); }, 'GOOGLE_READ_UNAVAILABLE'],
    [() => Response.json({ error: secret }, { status: 429 }), 'GOOGLE_READ_UNAVAILABLE'],
    [() => Response.json({ error: secret }, { status: 503 }), 'GOOGLE_READ_UNAVAILABLE'],
    [() => new Response(secret), 'GOOGLE_RESPONSE_INVALID'],
    [() => new Response('x'.repeat(65537)), 'GOOGLE_RESPONSE_INVALID'],
    [() => Response.json(null), 'GOOGLE_RESPONSE_INVALID'],
    [() => new Response(new ReadableStream({ start(controller) { controller.error(new Error(secret)); } })), 'GOOGLE_READ_UNAVAILABLE'],
  ]) {
    const f = fixture(); f.options.onRequest = request;
    const report = await expectFailure(f, 'businessIdentity', expected); assert(!JSON.stringify(report).includes(secret)); assert.equal(f.calls.length, 1);
  }
});
