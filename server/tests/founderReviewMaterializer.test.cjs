const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../enterprise/content/service');
const { catalog } = require('../enterprise/content/catalog');
const { hash } = require('../enterprise/content/qa');
const proof = service.OCTOBER_1_MEDIA_PROOFS[0];
const owner = 'a'.repeat(24);
const createdAt = new Date('2026-10-01T19:00:00Z');

// Explicit in-memory collection stub. Real MongoDB coverage is in contentFactory.test.cjs.
function fixture({ status = 'DRAFT', attached = false, beforeWrite } = {}) {
  const p = structuredClone(catalog().find(item => item.id === proof.id).package);
  if (attached) p.production = { status: 'FOUNDER_REVIEW', media: structuredClone(proof.media) };
  const doc = { _id: service.key(owner, proof.id), owner, itemId: proof.id, kind: 'C0_ITEM',
    currentVersion: 1, versions: [{ number: 1, hash: hash(p), package: p, createdAt }],
    status, approval: null, createdAt, updatedAt: createdAt };
  let updates = 0;
  const states = {
    findOne: async query => query._id === doc._id ? structuredClone(doc) : null,
    aggregate: () => ({ toArray: async () => [] }),
    updateOne: async (filter, update) => {
      updates += 1;
      if (beforeWrite) beforeWrite(doc);
      const matches = filter._id === doc._id && filter.owner === doc.owner
        && filter.currentVersion === doc.currentVersion && filter.status === doc.status
        && (filter.updatedAt === undefined || +filter.updatedAt === +doc.updatedAt)
        && (filter.founderActionAt === undefined || (filter.founderActionAt.$exists === false && !Object.hasOwn(doc, 'founderActionAt')));
      if (!matches) return { modifiedCount: 0 };
      Object.assign(doc, structuredClone(update.$set));
      doc.versions.push(structuredClone(update.$push.versions));
      return { modifiedCount: 1 };
    },
  };
  const db = { collection: name => { assert.equal(name, 'enterprisestates'); return states; } };
  return { db, doc, get updates() { return updates; },
    run: (items = [proof]) => service.materializeFounderReview({ db, owner, items, now: new Date('2026-10-01T20:00:00Z') }) };
}
test('untouched drafts materialize once and identical reviewed proof remains idempotent', async () => {
  const f = fixture();
  assert.equal((await f.run()).items[0].status, 'MATERIALIZED');
  assert.equal(f.doc.currentVersion, 2);
  const snapshot = structuredClone(f.doc);
  const second = await f.run();
  assert.equal(second.items[0].status, 'EXISTS');
  assert.equal(second.reviewItemCount, 1);
  assert.deepEqual(f.doc, snapshot);
  assert.equal(f.updates, 1);
});
test('founder decision states and receipts are preserved with identical or replacement proof', async () => {
  for (const status of ['HOLD', 'REJECTED', 'APPROVED', 'APPROVING']) {
    for (const attached of [false, true]) {
      const f = fixture({ status, attached });
      if (status === 'APPROVED') {
        f.doc.approval = { hash: f.doc.versions[0].hash, approvedBy: owner };
        f.doc.socialCampaignId = 'existing-campaign';
      }
      const snapshot = structuredClone(f.doc);
      for (const sha256 of [proof.media.sha256, 'b'.repeat(64)]) {
        const result = await f.run([{ ...proof, media: { ...proof.media, sha256 } }]);
        assert.equal(result.items[0].status, 'PRESERVED');
        assert.equal(result.items[0].contentStatus, status);
        assert.equal(result.reviewItemCount, 0);
        assert.equal(result.preservedItemCount, 1);
        assert.deepEqual(f.doc, snapshot);
      }
      assert.equal(f.updates, 0);
    }
  }
});
test('edited drafts, founder feedback and existing reviewed replacement media are not reset', async () => {
  for (const customize of [
    doc => { doc.currentVersion = 2; doc.versions.push({ ...structuredClone(doc.versions[0]), number: 2 }); },
    doc => { doc.founderActionAt = createdAt; },
    doc => { doc.updatedAt = new Date(+createdAt + 1); },
    doc => { doc.versions[0].package.production = { media: { ...proof.media, sha256: 'c'.repeat(64) } }; },
  ]) {
    const f = fixture(); customize(f.doc);
    const snapshot = structuredClone(f.doc);
    assert.equal((await f.run()).items[0].status, 'PRESERVED');
    assert.deepEqual(f.doc, snapshot);
    assert.equal(f.updates, 0);
  }
  const f = fixture({ status: 'FOUNDER_REVIEW', attached: true });
  assert.equal((await f.run([{ ...proof, media: { ...proof.media, sha256: 'd'.repeat(64) } }])).items[0].status, 'PRESERVED');
  assert.equal(f.updates, 0);
});
test('a concurrent founder action wins, even when status/version and timestamps are unchanged', async () => {
  const f = fixture({ beforeWrite: doc => { doc.founderActionAt = createdAt; } });
  const result = await f.run();
  assert.equal(result.items[0].status, 'BLOCKED');
  assert.equal(result.items[0].code, 'CONTENT_VERSION_CHANGED');
  assert.equal(f.doc.status, 'DRAFT');
  assert.equal(f.doc.currentVersion, 1);
  assert.equal(f.doc.versions.length, 1);
  assert.deepEqual(f.doc.founderActionAt, createdAt);
});
