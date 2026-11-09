'use strict';
require('./contentPrivateConfigFixture.cjs').configure();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const calendar = require('../enterprise/content/productionCalendar');
const { createStore, KIND: POINTER_KIND } = require('../enterprise/content/driveDraftStore');
const { hash } = require('../enterprise/content/qa');
const { fakeGoogle } = require('./contentDriveFixture.cjs');
const owner = '111111111111111111111111';
const env = { ENTERPRISE_INTELLIGENCE_ENABLED: 'true', ENTERPRISE_OWNER_USER_ID: owner, CONTENT_FACTORY_ENABLED: 'true' };
const exact = plan => ({ expectedHash: plan?.hash || null, expectedRevision: plan?.revision || null });
const operation = (plan, other = {}) => ({ operationId: crypto.randomUUID(), ...exact(plan), ...other });

function fixture() {
  const docs = new Map(), writes = [], google = fakeGoogle(owner);
  const matches = (document, query) => document && Object.entries(query).every(([key, value]) => value && typeof value === 'object' && '$exists' in value ? (document[key] !== undefined) === value.$exists : document[key] === value);
  const collection = {
    async findOne(query) { return structuredClone([...docs.values()].find(d => matches(d, query)) || null); },
    find(query) { const cursor = { sort() { return cursor; }, limit(n) { cursor.n = n; return cursor; }, async toArray() { return structuredClone([...docs.values()].filter(d => matches(d, query)).slice(0, cursor.n)); } }; return cursor; },
    async updateOne(query, update, options = {}) {
      writes.push(structuredClone(update));
      let doc = [...docs.values()].find(d => matches(d, query));
      if (!doc && options.upsert) {
        if (docs.has(query._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        doc = { ...query, ...update.$setOnInsert }; docs.set(doc._id, doc);
      }
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, structuredClone(update.$set || {}));
      for (const key of Object.keys(update.$unset || {})) delete doc[key];
      return { modifiedCount: 1 };
    }
  };
  const db = { collection: () => collection }, store = createStore({ db, owner, ...google });
  const contentService = { async list() {
    const items = (await store.list()).filter(r => r.kind === 'C0_ITEM').map(r => ({ id: r.itemId, version: r.currentVersion, hash: r.versions[0].hash, revision: r._drive.contentSha256, status: r.status, approval: r.approval, release: r.release, package: r.versions[0].package, storage: { provider: 'GOOGLE_DRIVE', fileId: r._drive.fileId } }));
    return { items, storage: { error: null } };
  } };
  const options = { db, store, owner, env, contentService };
  const initialize = async (other = {}) => (await calendar.setWindow({ ...options, input: operation(null, { startDate: '2026-11-09', timeZone: 'America/Chicago', days: 7, ...other }) })).plan;
  const edit = (plan, patch, date = plan.startDate) => calendar.updateSlot({ ...options, date, input: operation(plan, { patch }) });
  async function seed(id = 'existing-longform', changes = {}) {
    const p = { title: 'Existing private long-form', type: 'longform', production: {}, ...changes.package };
    const r = { owner, itemId: id, kind: 'C0_ITEM', currentVersion: 1, versions: [{ number: 1, package: p, hash: hash(p) }], status: changes.status || 'DRAFT', approval: null, ...changes };
    delete r.package;
    const saved = await store.save({ id, expectedHash: null, record: r });
    return { id, hash: saved.versions[0].hash, revision: saved._drive.contentSha256, version: saved.currentVersion };
  }
  return { options, initialize, edit, seed, google, docs, writes, store };
}

test('read is side-effect free and has no implicit start date or generated content', async () => {
  const f = fixture();
  const result = await calendar.read(f.options);
  assert.equal(result.plan, null); assert.equal(result.defaults.startDate, null);
  assert.equal(result.defaults.timeZone, 'America/Chicago'); assert.equal(result.catalog.preparedDays, 7);
  assert.equal(result.catalog.automaticGeneration, false); assert.equal(result.publication.schedulingEnabled, false);
  assert.equal(f.writes.length, 0); assert.equal(f.google.calls.length, 0);
});
test('explicit bounded window creates empty daily long-form slots only in private Drive', async () => {
  const f = fixture(), plan = await f.initialize({ days: 31 });
  assert.equal(plan.slots.length, 31); assert.equal(plan.endDate, '2026-12-09');
  assert(plan.slots.every(s => s.format === 'LONG_FORM' && s.itemRef === null && s.deadline === null && s.proposedPublication === null && s.note === ''));
  const pointers = [...f.docs.values()]; assert.equal(pointers.length, 1); assert.equal(pointers[0].kind, POINTER_KIND);
  for (const text of ['slots', 'note', 'startDate', 'timeZone', 'versions', 'package']) assert(!JSON.stringify(f.writes).includes(text));
  const bytes = f.google.files.get(plan.storage.fileId).bytes.toString(); assert(bytes.includes('2026-11-09')); assert(bytes.includes('America/Chicago'));
  assert(f.google.calls.every(c => c.method === 'GET' || c.url === 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id'));
});
test('invalid range, missing timezone/start, overflow and unknown fields reject without writes', async () => {
  for (const change of [{ startDate: '' }, { startDate: '2026-02-30' }, { timeZone: '' }, { timeZone: 'Mars/Olympus' }, { days: 0 }, { days: 32 }, { days: 1.5 }, { startDate: '2100-12-31', days: 2 }, { autoPublish: true }]) {
    const f = fixture(); await assert.rejects(f.initialize(change)); assert.equal(f.writes.length, 0);
  }
});
test('same operation is idempotent; reuse with a different payload fails closed', async () => {
  const f = fixture(), input = operation(null, { startDate: '2026-11-09', timeZone: 'America/Chicago', days: 7 });
  const first = await calendar.setWindow({ ...f.options, input }), count = f.google.files.size;
  const second = await calendar.setWindow({ ...f.options, input });
  assert.equal(second.replayed, true); assert.equal(second.plan.revision, first.plan.revision); assert.equal(f.google.files.size, count);
  await assert.rejects(calendar.setWindow({ ...f.options, input: { ...input, days: 8 } }), /PLAN_OPERATION_REUSED/);
});
test('no-op edits do not write, and stale exact plan revisions cannot overwrite', async () => {
  const f = fixture(), plan = await f.initialize();
  const count = f.google.files.size;
  assert.equal((await f.edit(plan, { note: '' })).changed, false); assert.equal(f.google.files.size, count);
  const edited = await f.edit(plan, { note: 'Founder planning note, Drive only' });
  await assert.rejects(f.edit(plan, { note: 'stale tab' }), /PLAN_VERSION_CHANGED/);
  assert.equal(edited.plan.slots[0].note, 'Founder planning note, Drive only'); assert(!JSON.stringify(f.writes).includes('Founder planning note'));
});
test('concurrent writes have one CAS winner and keep immutable old plan', async () => {
  const f = fixture(), plan = await f.initialize();
  const results = await Promise.allSettled([f.edit(plan, { note: 'first' }), f.edit(plan, { note: 'second' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.message, 'CONTENT_VERSION_CHANGED');
  assert(f.google.files.has(plan.storage.fileId));
});
test('rolling window preserves overlapping work and linked archived history', async () => {
  const f = fixture(), start = await f.initialize();
  const old = (await f.edit(start, { note: 'Keep this task' }, '2026-11-11')).plan;
  const rolled = (await calendar.setWindow({ ...f.options, input: operation(old, { startDate: '2026-11-11', timeZone: 'America/Chicago', days: 3 }) })).plan;
  assert.equal(rolled.slots[0].note, 'Keep this task'); assert.equal(rolled.slots[2].date, '2026-11-13');
  assert.equal(rolled.previousRevision.fileId, old.storage.fileId);
  assert.equal(JSON.parse(f.google.files.get(old.storage.fileId).bytes).versions[0].package.startDate, '2026-11-09');
});
test('more than 100 revisions retain a complete immutable predecessor chain without a 20-edit cap', async () => {
  const f = fixture(); let plan = await f.initialize({ days: 1 }); const firstFile = plan.storage.fileId;
  for (let i = 0; i < 105; i++) plan = (await f.edit(plan, { note: `revision ${i}` })).plan;
  assert.equal(plan.version, 106); assert.equal(plan.history.length, 30);
  let id = plan.storage.fileId, count = 0, first;
  while (id) { const raw = JSON.parse(f.google.files.get(id).bytes); assert.equal(raw.versions.length, 1); assert(raw.operations.length <= 100); first = id; id = raw.previousRevision?.fileId; count++; }
  assert.equal(count, 106); assert.equal(first, firstFile);
});
test('existing Drive long-form selection binds exact version and revision; duplicate assignments blocked', async () => {
  const f = fixture(), ref = await f.seed(), plan = await f.initialize();
  const assigned = (await f.edit(plan, { itemRef: ref, status: 'IN_PROGRESS' })).plan;
  assert.deepEqual(assigned.slots[0].itemRef, ref);
  await assert.rejects(f.edit(assigned, { itemRef: ref }, '2026-11-10'), /PLAN_CONTENT_ALREADY_ASSIGNED/);
  await assert.rejects(f.edit(assigned, { itemRef: { ...ref, revision: 'f'.repeat(64) } }), /PLAN_CONTENT_CHANGED/);
  await assert.rejects(f.edit(assigned, { itemRef: { ...ref, owner: 'other' } }), /PLAN_ITEM_REFERENCE_INVALID/);
});
test('unprepared, legacy, wrong-kind and non-long-form content cannot be assigned as prepared long-form', async () => {
  const f = fixture(), plan = await f.initialize(), short = await f.seed('short', { package: { type: 'derivative' } });
  await assert.rejects(f.edit(plan, { itemRef: short }), /PLAN_DRIVE_LONGFORM_REQUIRED/);
  await assert.rejects(f.edit(plan, { itemRef: { ...short, id: 'missing' } }), /PLAN_DRIVE_LONGFORM_REQUIRED/);
  await assert.rejects(f.edit(plan, { itemRef: { id: calendar.PLAN_ID, version: plan.version, hash: plan.hash, revision: plan.revision } }), /PLAN_DRIVE_LONGFORM_REQUIRED/);
});
test('production status never bypasses image-first, review or final approval gates', async () => {
  const f = fixture(), ref = await f.seed(), plan = await f.initialize();
  await assert.rejects(f.edit(plan, { status: 'IN_PROGRESS' }), /PLAN_CONTENT_REQUIRED/);
  await assert.rejects(f.edit(plan, { itemRef: ref, step: 'VIDEO_ASSEMBLY', status: 'IN_PROGRESS' }), /FOUNDER_IMAGE_APPROVAL_REQUIRED/);
  await assert.rejects(f.edit(plan, { itemRef: ref, step: 'COPY', status: 'COMPLETE' }), /PLAN_FINAL_APPROVAL_REQUIRED/);
  const planned = await f.edit(plan, { itemRef: ref, step: 'VIDEO_ASSEMBLY', status: 'PLANNED' }); assert.equal(planned.scheduled, false);
  const withImages = await f.seed('images-only', { package: { production: { imageApproval: { recorded: true } } } });
  await assert.rejects(f.edit(planned.plan, { itemRef: withImages, step: 'FINAL_APPROVAL', status: 'IN_PROGRESS' }), /PLAN_VIDEO_REVIEW_REQUIRED/);
});
test('hold/rejection and source changes are shown without mutating plan or claiming approvals', async () => {
  const f = fixture(), ref = await f.seed(), plan = (await f.edit(await f.initialize(), { itemRef: ref })).plan;
  let data = await calendar.read(f.options); assert.equal(data.plan.slots[0].observed.status, 'CURRENT');
  const raw = await f.store.get(ref.id); raw.status = 'HOLD';
  await f.store.save({ id: ref.id, expectedHash: ref.hash, expectedContentSha256: ref.revision, record: raw });
  const count = f.writes.length; data = await calendar.read(f.options);
  assert.equal(data.plan.slots[0].observed.status, 'CHANGED'); assert.equal(f.writes.length, count); assert.equal(data.plan.revision, plan.revision);
  const held = await f.store.get(ref.id);
  await assert.rejects(f.edit(plan, { itemRef: { ...ref, revision: held._drive.contentSha256 }, status: 'IN_PROGRESS' }), /PLAN_CONTENT_ON_HOLD/);
});
test('publication proposal resolves explicit timezone but performs no scheduling', async () => {
  const f = fixture(), plan = await f.initialize();
  const result = await f.edit(plan, { deadlineLocal: '2026-11-10T14:30', proposedPublicationLocal: '2026-11-11T09:00' });
  assert.equal(result.plan.slots[0].deadline.instant, '2026-11-10T20:30:00.000Z');
  assert.equal(result.plan.slots[0].proposedPublication.instant, '2026-11-11T15:00:00.000Z'); assert.equal(result.scheduled, false);
  assert([...f.docs.values()].every(d => d.kind === POINTER_KIND));
  await assert.rejects(calendar.setWindow({ ...f.options, input: operation(result.plan, { startDate: plan.startDate, days: 7, timeZone: 'Etc/UTC' }) }), /PLAN_TIMEZONE_HAS_TIMES/);
});
test('DST gaps, duplicate wall times and invalid datetimes reject instead of silently shifting', () => {
  assert.throws(() => calendar.timestamp('2026-03-08T02:30', 'America/Chicago'), /PLAN_TIME_DOES_NOT_EXIST/);
  assert.throws(() => calendar.timestamp('2026-11-01T01:30', 'America/Chicago'), /PLAN_TIME_AMBIGUOUS/);
  assert.throws(() => calendar.timestamp('2026-02-30T12:30', 'America/Chicago'), /PLAN_DATE_INVALID/);
  assert.throws(() => calendar.timestamp('2026-11-09T24:30', 'America/Chicago'), /PLAN_TIME_INVALID/);
  assert.equal(calendar.timestamp('2026-07-09T12:00', 'America/Chicago').instant, '2026-07-09T17:00:00.000Z');
  assert.equal(calendar.timestamp(null, 'America/Chicago'), null);
});
test('owner/feature guards deny before reads; Drive failure never falls back to Mongo content', async () => {
  const f = fixture();
  for (const change of [{ owner: '222222222222222222222222' }, { env: { ...env, CONTENT_FACTORY_ENABLED: 'false' } }]) await assert.rejects(calendar.read({ ...f.options, ...change }), /NOT_FOUND/);
  assert.equal(f.writes.length, 0); assert.equal(f.google.calls.length, 0);
  const store = createStore({ db: f.options.db, owner, workspace: f.google.workspace, fetchImpl: async () => { throw new Error('private-token'); } });
  await assert.rejects(calendar.setWindow({ ...f.options, store, input: operation(null, { startDate: '2026-11-09', timeZone: 'America/Chicago', days: 7 }) }), /DRIVE_DRAFT_REQUEST_FAILED/);
  assert.equal(f.writes.length, 0);
});
test('wrong-kind colliding plan identity fails closed', async () => {
  const f = fixture(); await f.seed(calendar.PLAN_ID);
  await assert.rejects(calendar.read(f.options), /PLAN_RECORD_INVALID/);
  await assert.rejects(f.initialize(), /PLAN_RECORD_INVALID/);
});
test('release receipt is read-only evidence, not a scheduled or published assertion', async () => {
  const f = fixture(), ref = await f.seed();
  const raw = await f.store.get(ref.id); raw.status = 'APPROVED'; raw.approval = { hash: ref.hash, version: ref.version };
  raw.release = { hash: ref.hash, version: ref.version, campaignId: 'approved-campaign', status: 'RELEASED', provider: 'youtube', scheduledTime: '2026-12-01T15:00:00Z' };
  const saved = await f.store.save({ id: ref.id, expectedHash: ref.hash, expectedContentSha256: ref.revision, record: raw });
  await f.edit(await f.initialize(), { itemRef: { ...ref, revision: saved._drive.contentSha256 } });
  const data = await calendar.read(f.options), release = data.plan.slots[0].observed.release;
  assert.equal(release.status, 'RELEASED'); assert.equal(release.publication, 'NOT_CONFIRMED_BY_CALENDAR'); assert.equal(data.plan.slots[0].proposedPublication, null);
});
test('release completion requires its own current receipt, and stale references can be cleared', async () => {
  const f = fixture(), ref = await f.seed('ready', { package: { production: { imageApproval: { recorded: true }, review: { recorded: true } } } });
  const raw = await f.store.get(ref.id); raw.status = 'APPROVED'; raw.approval = { hash: ref.hash, version: ref.version };
  const saved = await f.store.save({ id: ref.id, expectedHash: ref.hash, expectedContentSha256: ref.revision, record: raw });
  const freshRef = { ...ref, revision: saved._drive.contentSha256 }, plan = await f.initialize();
  await assert.rejects(f.edit(plan, { itemRef: freshRef, step: 'RELEASE', status: 'COMPLETE' }), /PLAN_RELEASE_RECEIPT_REQUIRED/);
  const assigned = (await f.edit(plan, { itemRef: freshRef })).plan;
  raw.status = 'HOLD'; await f.store.save({ id: ref.id, expectedHash: ref.hash, expectedContentSha256: freshRef.revision, record: raw });
  const cleared = await f.edit(assigned, { itemRef: null, status: 'PLANNED' }); assert.equal(cleared.plan.slots[0].itemRef, null);
});
test('HTTP routes enforce exact owner/role, disable caching, and keep GET read-only', async () => {
  const { createRouter } = require('../routes/productionCalendarRoutes');
  const calls = [], app = express(); app.use(express.json());
  app.use('/plan', createRouter({ env, getDb: () => ({}), authenticate: (req, _res, next) => { req.user = { _id: req.headers['test-user'], role: req.headers['test-role'] }; next(); },
    service: { read: async () => { calls.push('read'); return { plan: null }; }, setWindow: async () => { calls.push('write'); return {}; }, updateSlot: async () => { calls.push('write'); return {}; } } }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/plan`;
  try {
    for (const headers of [{}, { 'test-user': owner, 'test-role': 'ADMIN' }, { 'test-user': '222222222222222222222222', 'test-role': 'COMMANDER_IN_CHIEF' }]) {
      const result = await fetch(url, { headers }); assert.equal(result.status, 404); assert.equal(result.headers.get('cache-control'), 'private, no-store');
    }
    assert.deepEqual(calls, []);
    const headers = { 'test-user': owner, 'test-role': 'COMMANDER_IN_CHIEF' };
    const result = await fetch(url, { headers }); assert.equal(result.status, 200); assert.deepEqual(calls, ['read']);
    await fetch(url + '/window', { method: 'POST', headers }); await fetch(url + '/slots/2026-11-09', { method: 'PATCH', headers }); assert.deepEqual(calls, ['read', 'write', 'write']);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
