const test = require('node:test');
const assert = require('node:assert/strict');
const { createCampaignDrafts, legacyProjection } = require('../social/driveCampaignDrafts');
const { hash } = require('../enterprise/content/qa');
const clone = value => JSON.parse(JSON.stringify(value));
const owner = '123456789012345678901234';
const sample = { name: 'Test campaign', posts: [{ provider: 'youtube', title: 'Title', caption: 'Private draft', publishStatus: 'published' }] };
function fixture() {
  const files = new Map(), mongo = new Map(); let writes = 0, revision = 0;
  const store = {
    get: async key => files.has(key) ? clone(files.get(key)) : null,
    list: async () => [...files.values()].map(clone),
    save: async ({ id, expectedHash, expectedContentSha256, record }) => {
      const prev = files.get(id);
      if (prev ? prev.versions.at(-1).hash !== expectedHash || prev._drive.contentSha256 !== expectedContentSha256 : expectedHash !== null || expectedContentSha256 !== null) throw Object.assign(new Error('CONTENT_VERSION_CHANGED'), { statusCode: 409 });
      const next = clone(record); next._drive = { contentSha256: hash({ revision: ++revision }) }; files.set(id, next); return clone(next);
    },
  };
  const campaigns = {
    findOne: async ({ _id, userId }) => mongo.get(_id)?.userId === userId ? clone(mongo.get(_id)) : null,
    find: ({ userId }) => ({ sort: () => ({ limit: async () => [...mongo.values()].filter(v => v.userId === userId).map(clone) }) }),
    create: async value => { writes++; assert.equal(value.status, 'approved'); assert.ok(value.posts.every(p => p.publishStatus === 'approved')); mongo.set(value._id, clone(value)); return value; },
  };
  const api = createCampaignDrafts({ owner, store, campaigns });
  return { api, files, mongo, store, campaigns, writes: () => writes };
}
test('new generation and edits persist only to Drive, keep history and reject stale hash/revision', async () => {
  const f = fixture(), draft = await f.api.create(sample);
  assert.equal(f.writes(), 0); assert.equal(draft.posts[0].publishStatus, 'draft');
  const edited = await f.api.edit(draft._id, draft.expectedHash, draft.expectedRevision, value => ({ ...value, name: 'Edited' }));
  assert.equal(f.files.values().next().value.versions.length, 2);
  assert.equal(f.writes(), 0);
  await assert.rejects(f.api.edit(draft._id, draft.expectedHash, draft.expectedRevision, v => v), /CONTENT_VERSION_CHANGED/);
  await assert.rejects(f.api.approve(draft._id, edited.expectedHash, draft.expectedRevision), /CONTENT_VERSION_CHANGED/);
});
test('approval releases only exact final version, with no scheduled posts', async () => {
  const f = fixture(), draft = await f.api.create({ ...sample, posts: [{ ...sample.posts[0], scheduledTime: '2099-01-01T00:00:00Z', connectedAccountId: owner }] });
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(f.writes(), 1); assert.equal(approved.status, 'approved'); assert.equal(approved.posts[0].publishStatus, 'approved');
  assert.equal(approved.metadata.driveApproval.hash, draft.expectedHash);
  assert.equal(f.files.values().next().value.status, 'APPROVED');
  assert.equal((await f.api.list()).length, 1);
});
test('editing historical and published campaigns forks without changing original content', async () => {
  const f = fixture(), legacy = { ...sample, _id: 'abcdef123456abcdef123456', userId: owner, status: 'published' };
  f.mongo.set(legacy._id, clone(legacy)); const before = legacyProjection(legacy);
  const result = await f.api.edit(legacy._id, before.expectedHash, undefined, v => ({ ...v, name: 'New review' }));
  assert.notEqual(result._id, legacy._id); assert.deepEqual(f.mongo.get(legacy._id), legacy);
  assert.equal(result.metadata.sourceCampaignId, legacy._id); assert.equal(f.writes(), 0);
  await assert.rejects(f.api.approve(legacy._id, before.expectedHash), /SAVE_DRIVE_REVIEW_VERSION_FIRST/);
});
test('generic C0 editing and approval are blocked; detached C0 media is also blocked', async () => {
  const f = fixture();
  await assert.rejects(f.api.create({ ...sample, metadata: { c0: { itemId: 'x' } } }), /C0_REVIEW_REQUIRED/);
  await assert.rejects(f.api.create({ ...sample, posts: [{ ...sample.posts[0], metadata: { c0MediaSha256: 'x' } }] }), /C0_LINKAGE_REQUIRED/);
});
test('Drive unavailable fails closed with no Mongo fallback', async () => {
  const f = fixture(); f.store.save = async () => { throw new Error('DRIVE_DRAFT_AUTH_REQUIRED'); };
  await assert.rejects(f.api.create(sample), /DRIVE_DRAFT_AUTH_REQUIRED/); assert.equal(f.writes(), 0);
});
test('owner isolation and reads do not create or schedule campaigns', async () => {
  const f = fixture(); f.mongo.set('other', { ...sample, _id: 'other', userId: 'different' });
  const draft = await f.api.create(sample); assert.equal(await f.api.get('other'), null);
  const read = await f.api.get(draft._id); assert.equal(read.status, 'draft'); assert.equal((await f.api.list()).length, 1); assert.equal(f.writes(), 0);
});
test('approval locks out a racing editor even when package hash is unchanged', async () => {
  const f = fixture(), draft = await f.api.create(sample), save = f.store.save;
  let race;
  f.store.save = async request => {
    if (request.record.status === 'APPROVING') {
      const locked = await save(request);
      race = f.api.edit(draft._id, draft.expectedHash, draft.expectedRevision, v => ({ ...v, name: 'Racing edit' }));
      await assert.rejects(race, /DRAFT_NOT_EDITABLE|CONTENT_VERSION_CHANGED/);
      return locked;
    }
    return save(request);
  };
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(approved.name, sample.name); assert.equal(f.writes(), 1);
});
test('invalid post schema fails before storing new draft content', async () => {
  const f = fixture();
  await assert.rejects(f.api.create({ ...sample, posts: [{ provider: 'unknown-provider' }] }), /validation failed/);
  assert.equal(f.files.size, 0); assert.equal(f.writes(), 0);
});
test('Drive outage preserves readable history but strict seeding cannot silently duplicate it', async () => {
  const f = fixture(), legacy = { ...sample, _id: 'abcdef123456abcdef123456', userId: owner, status: 'approved' }; f.mongo.set(legacy._id, legacy);
  f.store.list = async () => { throw new Error('DRIVE_DRAFT_AUTH_REQUIRED'); };
  const result = await f.api.list(); assert.equal(result.length, 1); assert.ok(result.storageError); assert.equal(f.writes(), 0);
  await assert.rejects(f.api.list({ requireDrive: true }), /DRIVE_DRAFT_AUTH_REQUIRED/);
});
test('committed approval reports pending Drive receipt and retry reconciles without another Mongo write', async () => {
  const f = fixture(), draft = await f.api.create(sample), save = f.store.save;
  let failReceipt = true, finalAttempts = 0;
  f.store.save = async request => {
    if (request.record.status === 'APPROVED') { finalAttempts++; if (failReceipt) throw new Error('DRIVE_UNAVAILABLE'); }
    return save(request);
  };
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(approved.status, 'approved'); assert.equal(approved.receiptSync.status, 'pending');
  assert.equal(approved.receiptSync.code, 'DRIVE_APPROVAL_RECEIPT_SYNC_PENDING');
  assert.equal(f.writes(), 1); assert.equal(finalAttempts, 1);
  const stored = clone(f.mongo.get(draft._id));
  await f.api.get(draft._id); await f.api.list();
  assert.equal(finalAttempts, 1); assert.equal(f.files.values().next().value.status, 'APPROVING');
  failReceipt = false;
  const retried = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(retried.receiptSync.status, 'synced'); assert.equal(f.writes(), 1);
  assert.deepEqual(f.mongo.get(draft._id), stored); assert.equal(retried.posts[0].publishStatus, 'approved');
  assert.equal(f.files.values().next().value.status, 'APPROVED');
  await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(finalAttempts, 2); assert.equal(f.writes(), 1);
});
test('ambiguous Drive final receipt commit is checked before any retry', async () => {
  const f = fixture(), draft = await f.api.create(sample), save = f.store.save; let attempts = 0;
  f.store.save = async request => { const result = await save(request); if (request.record.status === 'APPROVED') { attempts++; throw new Error('LOST_DRIVE_RESPONSE'); } return result; };
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(approved.receiptSync.status, 'synced'); assert.equal(attempts, 1); assert.equal(f.writes(), 1);
  await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision); assert.equal(attempts, 1);
});
test('ambiguous Mongo commit is looked up and never duplicated', async () => {
  const f = fixture(), draft = await f.api.create(sample), create = f.campaigns.create; let checks = 0;
  const findOne = f.campaigns.findOne; f.campaigns.findOne = async query => { checks++; return findOne(query); };
  f.campaigns.create = async value => { await create(value); throw new Error('LOST_MONGO_RESPONSE'); };
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(approved.status, 'approved'); assert.equal(approved.receiptSync.status, 'synced');
  assert.equal(checks, 2); assert.equal(f.writes(), 1);
});
test('unresolved Mongo outcome stays locked and retry checks existing final record first', async () => {
  const f = fixture(), draft = await f.api.create(sample), create = f.campaigns.create, findOne = f.campaigns.findOne;
  let lookupFails = false;
  f.campaigns.findOne = async query => { if (lookupFails) throw new Error('DATABASE_OFFLINE'); return findOne(query); };
  f.campaigns.create = async value => { await create(value); lookupFails = true; throw new Error('LOST_MONGO_RESPONSE'); };
  await assert.rejects(f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision), /APPROVAL_OUTCOME_UNCERTAIN/);
  assert.equal(f.files.values().next().value.status, 'APPROVING');
  lookupFails = false;
  const approved = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  assert.equal(approved.receiptSync.status, 'synced'); assert.equal(f.writes(), 1);
});
test('receipt reconciliation refuses mismatched versions, IDs, and hashes without writes', async () => {
  for (const change of [r => { r.currentVersion = 2; r.versions.push({ ...r.versions[0], number: 2 }); }, r => { r.itemId = 'social:different'; }, r => { r.versions[0].hash = '0'.repeat(64); }]) {
    const f = fixture(), draft = await f.api.create(sample), save = f.store.save; let attempts = 0;
    f.store.save = async request => { if (request.record.status === 'APPROVED') throw new Error('DRIVE_UNAVAILABLE'); return save(request); };
    await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
    const record = f.files.get(`social:${draft._id}`); change(record);
    f.store.save = async request => { attempts++; return save(request); };
    const retried = await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
    assert.equal(retried.receiptSync.code, 'DRIVE_APPROVAL_RECEIPT_MISMATCH'); assert.equal(attempts, 0); assert.equal(f.writes(), 1);
  }
});
test('read receipt status survives reload without writes and list reuses fetched records', async () => {
  const f = fixture(), draft = await f.api.create(sample), save = f.store.save;
  f.store.save = async request => { if (request.record.status === 'APPROVED') throw new Error('DRIVE_UNAVAILABLE'); return save(request); };
  await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  let gets = 0, lists = 0;
  const get = f.store.get, list = f.store.list;
  f.store.get = async key => { gets++; return get(key); };
  f.store.list = async () => { lists++; return list(); };
  f.store.save = async () => { throw new Error('READ_MUST_NOT_WRITE'); };
  const loaded = await f.api.get(draft._id);
  assert.equal(loaded.status, 'approved'); assert.equal(loaded.receiptSync.status, 'pending');
  assert.equal(loaded.receiptSync.hash, draft.expectedHash); assert.equal(gets, 1);
  const queue = await f.api.list(); assert.equal(queue[0].receiptSync.status, 'pending'); assert.equal(lists, 1); assert.equal(gets, 1);
  const record = f.files.get(`social:${draft._id}`); record.status = 'APPROVED';
  assert.equal((await f.api.get(draft._id)).receiptSync.status, 'synced');
  assert.equal((await f.api.list())[0].receiptSync.status, 'synced');
  record.currentVersion = 2; record.versions.push({ ...record.versions[0], number: 2 });
  assert.equal((await f.api.get(draft._id)).receiptSync.code, 'DRIVE_APPROVAL_RECEIPT_MISMATCH');
  assert.equal((await f.api.list())[0].receiptSync.status, 'pending'); assert.equal(f.writes(), 1);
});
test('read receipt status reports pending during Drive outages without hiding final or historical campaigns', async () => {
  const f = fixture(), draft = await f.api.create(sample);
  await f.api.approve(draft._id, draft.expectedHash, draft.expectedRevision);
  const historical = { ...sample, _id: 'abcdef123456abcdef123456', userId: owner, status: 'published' };
  f.mongo.set(historical._id, historical);
  f.store.get = async () => { throw new Error('DRIVE_OFFLINE'); };
  f.store.list = async () => { throw new Error('DRIVE_OFFLINE'); };
  f.store.save = async () => { throw new Error('READ_MUST_NOT_WRITE'); };
  const loaded = await f.api.get(draft._id); assert.equal(loaded.status, 'approved'); assert.equal(loaded.receiptSync.status, 'pending');
  assert.equal(loaded.receiptSync.code, 'DRIVE_APPROVAL_RECEIPT_SYNC_PENDING');
  const old = await f.api.get(historical._id); assert.equal(old.status, 'published'); assert.equal(old.receiptSync, undefined);
  const queue = await f.api.list(); assert.equal(queue.length, 2); assert.ok(queue.storageError);
  assert.equal(queue.find(c => c._id === draft._id).receiptSync.status, 'pending');
  assert.equal(queue.find(c => c._id === historical._id).receiptSync, undefined); assert.equal(f.writes(), 1);
});
