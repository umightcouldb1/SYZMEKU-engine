'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readPrivateConfig, privateConfigStatus, EMAIL_KEY, LOGO_KEY } = require('../enterprise/content/privateConfig');
const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID, configure } = require('./contentPrivateConfigFixture.cjs');
const { hash, qa } = require('../enterprise/content/qa');
const owner = '1234567890abcdef12345678';
const valid = () => ({ [EMAIL_KEY]: BUSINESS_ACCOUNT, [LOGO_KEY]: ORIGINAL_LOGO_FILE_ID });
async function withConfig(values, work) {
  const old = [process.env[EMAIL_KEY], process.env[LOGO_KEY]];
  delete process.env[EMAIL_KEY]; delete process.env[LOGO_KEY];
  Object.assign(process.env, values);
  try { return await work(); }
  finally {
    for (const [i, key] of [EMAIL_KEY, LOGO_KEY].entries()) {
      if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i];
    }
  }
}

test('private pins require strict explicit values, with no account or reference fallback', () => {
  assert.deepEqual(readPrivateConfig(valid()), { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID });
  assert.equal(readPrivateConfig({ ...valid(), [EMAIL_KEY]: BUSINESS_ACCOUNT.toUpperCase() }).BUSINESS_ACCOUNT, BUSINESS_ACCOUNT);
  assert(Object.isFrozen(readPrivateConfig(valid())));
  for (const [key, values, suffix] of [
    [EMAIL_KEY, [undefined, ''], 'EMAIL_CONFIG_REQUIRED'],
    [EMAIL_KEY, [null, false, ' ', 'bad', 'user@', 'user@example', 'user@-example.test', 'a..b@example.test', '.a@example.test', 'a.@example.test', 'a@example.test\n', ' a@example.test', 'a'.repeat(65) + '@example.test'], 'EMAIL_CONFIG_INVALID'],
    [LOGO_KEY, [undefined, ''], 'LOGO_CONFIG_REQUIRED'],
    [LOGO_KEY, [null, false, 'short', '../synthetic_logo', 'https://example.test/file', 'x'.repeat(151), ' logo_reference_12345'], 'LOGO_CONFIG_INVALID'],
  ]) {
    for (const value of values) {
      const env = { ...valid(), [key]: value };
      assert.throws(() => readPrivateConfig(env), { message: `GOOGLE_WORKSPACE_${suffix}`, statusCode: 503 });
      assert.deepEqual(privateConfigStatus(env), { configured: false, config: null, code: `GOOGLE_WORKSPACE_${suffix}` });
    }
  }
  assert.equal(privateConfigStatus({ ADMIN_EMAIL: BUSINESS_ACCOUNT, accountEmail: BUSINESS_ACCOUNT, originalLogoFileId: ORIGINAL_LOGO_FILE_ID }).configured, false);
});

test('missing or malformed either pin blocks every provider adapter before refresh, reads or writes', async () => {
  const { createMediaReader } = require('../enterprise/content/driveMedia');
  const { readExactPrivateImage } = require('../enterprise/content/privateImagePreview');
  const { createApprovedSlides } = require('../enterprise/content/approvedSlides');
  const { inspectPrivateVids, exportPrivateVids } = require('../enterprise/content/privateVidsExport');
  const { checkExistingDriveAccess } = require('../enterprise/content/driveAccessCheck');
  const { createStore } = require('../enterprise/content/driveDraftStore');
  for (const values of [{}, { ...valid(), [EMAIL_KEY]: 'not-email' }, { [EMAIL_KEY]: BUSINESS_ACCOUNT }, { ...valid(), [LOGO_KEY]: '../invalid' }]) {
    await withConfig(values, async () => {
      const expected = privateConfigStatus().code; let refresh = 0, requests = 0, writes = 0, connections = 0;
      const workspaceImpl = { getFreshAccessToken: async () => { refresh++; throw Error('Unexpected token request'); } };
      const fetchImpl = async () => { requests++; throw Error('Unexpected provider request'); };
      const common = { owner, workspaceImpl, fetchImpl, itemId: 'item', operationId: 'operation', expectedHash: 'a'.repeat(64) };
      const cases = [
        () => createMediaReader(common),
        () => readExactPrivateImage({ ...common, fileId: ORIGINAL_LOGO_FILE_ID, sha256: 'a'.repeat(64) }),
        () => createApprovedSlides({ ...common, package: {}, allowCreate: true }),
        () => inspectPrivateVids({ ...common, vidsFileId: 'synthetic_vids_12345' }),
        () => exportPrivateVids({ ...common, vidsFileId: 'synthetic_vids_12345', allowCreate: true }),
      ];
      for (const run of cases) await assert.rejects(run(), { message: expected, statusCode: 503 });
      const report = await checkExistingDriveAccess({ ...common, readConnectionImpl: async () => { connections++; } });
      assert.equal(report.ready, false); assert.equal(report.accountEmail, null); assert.equal(report.checks[0].code, expected);
      const record = { owner, itemId: 'item', currentVersion: 1, versions: [{ number: 1, hash: hash({ title: 'Synthetic' }), package: { title: 'Synthetic' } }], status: 'DRAFT' };
      const store = createStore({ db: { collection: () => ({ updateOne: async () => { writes++; } }) }, owner, workspace: workspaceImpl, fetchImpl });
      await assert.rejects(store.save({ id: 'item', expectedHash: null, record }), { message: expected, statusCode: 503 });
      assert.deepEqual({ refresh, requests, writes, connections }, { refresh: 0, requests: 0, writes: 0, connections: 0 });
    });
  }
});

test('correct private pins preserve the exact legacy visual contract serialization and canonical hashes', async () => {
  await withConfig(valid(), async () => {
    const visual = require('../enterprise/content/driveVisual');
    const expected = {
      version: 'FOUNDER_REFERENCE_IMAGES_V1',
      source: 'Original family-designed T.O.I. logo and founder-selected images',
      originalLogoFileId: ORIGINAL_LOGO_FILE_ID,
      philosophy: 'Preserve the original logo geometry. Black/charcoal, metallic silver/white, deep green and deep purple, with restrained iridescent reflected light.',
      limits: 'The founder selects actual images before video production. Color checks or old generated SVGs do not establish creative approval.',
    };
    assert.equal(JSON.stringify(visual.getContract()), JSON.stringify(expected));
    const p = require('../enterprise/content/catalog').variant('facebook'), old = structuredClone(p);
    old.visual = { ...expected, status: 'IMAGE_SELECTION_REQUIRED' };
    old.scenes = old.scenes.map(s => ({ ...s, asset: 'Founder-selected Drive image required; no automatic visual substitute.', visual: { status: 'IMAGE_SELECTION_REQUIRED' } }));
    if (old.cover) old.cover = { text: old.cover.text, style: expected.philosophy };
    old.production = { ...old.production, visualBrief: expected.philosophy, imageApproval: null, media: null, review: null, status: 'IMAGE_SELECTION_REQUIRED' };
    const actual = visual.pendingImages(p);
    assert.equal(JSON.stringify(actual), JSON.stringify(old)); assert.equal(hash(actual), hash(old));
    const selection = { reference: { fileId: ORIGINAL_LOGO_FILE_ID, sha256: 'a'.repeat(64) }, images: [{ sceneIndex: 0, fileId: 'synthetic_image_12345', sha256: 'b'.repeat(64) }] };
    assert.equal(visual.selectionHash(selection), hash(selection));
  });
});

test('a self-asserted alternate logo never becomes the configuration authority', async () => {
  await withConfig(valid(), async () => {
    const visual = require('../enterprise/content/driveVisual');
    const p = visual.pendingImages(require('../enterprise/content/catalog').variant('facebook'));
    const selection = { reference: { fileId: 'alternate_logo_12345', sha256: 'a'.repeat(64) }, images: p.scenes.map((_, sceneIndex) => ({ sceneIndex, fileId: 'synthetic_image_12345', sha256: 'b'.repeat(64) })) };
    p.production.imageApproval = { ...selection, selectionHash: visual.selectionHash(selection) };
    assert.equal(qa(p).checks.find(c => c.id === 'founder_selected_images').status, 'PENDING');
    let reads = 0;
    await assert.rejects(require('../enterprise/content/service').assertSelectedImages(p, { inspect: async () => { reads++; } }), /FOUNDER_IMAGE_APPROVAL_REQUIRED/);
    assert.equal(reads, 0);
  });
});

test('missing pins preserve historical reads and show an explicit blocked state without provider calls', async () => {
  await withConfig({}, async () => {
    const catalog = require('../enterprise/content/catalog'), service = require('../enterprise/content/service');
    const p = catalog.variant('facebook'), before = JSON.stringify(p);
    const record = { kind: 'C0_ITEM', owner, itemId: 'legacy', currentVersion: 1, versions: [{ number: 1, hash: hash(p), package: p }], status: 'HOLD' };
    const collection = { find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [record] }) }) }), findOne: async () => null };
    let calls = 0;
    const result = await service.list({ collection: () => collection }, owner, { store: { list: async () => { calls++; throw Error('Unexpected Drive request'); } } });
    assert.equal(calls, 0); assert.equal(result.items.length, 1); assert.equal(result.items[0].status, 'HOLD');
    assert.equal(result.items[0].storage.provider, 'LEGACY_MONGODB'); assert.equal(result.visual.originalLogoFileId, null);
    assert.equal(result.storage.error, 'GOOGLE_WORKSPACE_EMAIL_CONFIG_REQUIRED'); assert.equal(result.reviewBatch.status, 'BLOCKED');
    assert.equal(JSON.stringify(result.items[0].package), before);
    assert.equal(qa(p).checks.find(c => c.id === 'founder_selected_images').detail, 'GOOGLE_WORKSPACE_EMAIL_CONFIG_REQUIRED');
    assert(!qa(p, [], { legacyApproved: true }).checks.some(c => c.id === 'founder_selected_images'));
    assert.equal((await service.prepareDaily({ env: {} })).status, 'OFF');
  });
});

test('all affected application modules load with no pins, without provider access or startup exception', () => {
  const env = { ...process.env }; delete env[EMAIL_KEY]; delete env[LOGO_KEY];
  const code = "global.fetch=()=>{throw Error('No network allowed')};for(const name of ['privateConfig','qa','driveVisual','driveMedia','driveDraftStore','approvedSlides','privateVidsExport','privateImagePreview','driveAccessCheck','service','productionCalendar','approvedRelease'])require('./server/enterprise/content/'+name);require('./server/routes/contentFactoryRoutes');require('./server/routes/socialCommandRoutes');";
  const child = spawnSync(process.execPath, ['-e', code], { cwd: require('node:path').resolve(__dirname, '../..'), env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});

test('synthetic fixtures explicitly replace any inherited private configuration', async () => {
  await withConfig({ [EMAIL_KEY]: 'different@example.invalid', [LOGO_KEY]: 'different_reference_12345' }, async () => {
    configure(); assert.deepEqual(readPrivateConfig(), { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID });
  });
});
