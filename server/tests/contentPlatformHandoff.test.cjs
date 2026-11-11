const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../enterprise/content/service');
const { catalog } = require('../enterprise/content/catalog');
const { hash } = require('../enterprise/content/qa');
const { PLATFORMS, SCOPE } = require('../enterprise/content/platformHandoff');
let f, db, owner, client;
const unassigned = () => Object.fromEntries(Object.keys(PLATFORMS).map(platform => [platform, null]));
const checks = () => Object.fromEntries(service.REVIEW_CHECKS.map(name => [name, true]));

before(async () => {
  f = await require('./patternFixture.cjs')(); db = f.mongoose.connection.db; owner = f.founder.id; client = f.mongoose.connection.getClient();
  Object.assign(process.env, { ENTERPRISE_INTELLIGENCE_ENABLED: 'true', ENTERPRISE_OWNER_USER_ID: owner, CONTENT_FACTORY_ENABLED: 'true' });
  f.app.use('/api/content-factory', require('../routes/contentFactoryRoutes'));
  f.app.use('/api/social-command', require('../routes/socialCommandRoutes'));
  f.app.use((error, _req, res, _next) => res.status(error.statusCode || (res.statusCode >= 400 ? res.statusCode : 500)).json({ code: error.message }));
});
after(async () => { await f?.close(); });
beforeEach(async () => { for (const name of ['enterprisestates', 'socialcampaigns', 'socialconnections']) await db.collection(name).deleteMany({}); });

async function seed({ id = 'organic-d01-teaching-capacity', method = 'FOUNDER_ATTESTATION', mutate } = {}) {
  const p = structuredClone(catalog().find(item => item.id === id).package);
  p.production = { status: 'FOUNDER_REVIEW', media: { url: 'https://www.toisouljahacademy.com/assets/content-factory/synthetic.mp4', sha256: 'a'.repeat(64), duration: p.duration }, review: { method, by: owner, checks: checks() } };
  if (mutate) mutate(p);
  const version = { number: 1, hash: hash(p), package: p, createdAt: new Date() };
  await db.collection('enterprisestates').insertOne({ _id: service.key(owner, id), owner, kind: 'C0_ITEM', itemId: id, currentVersion: 1, versions: [version], status: 'FOUNDER_REVIEW', approval: null, createdAt: new Date(), updatedAt: new Date() });
  return { db, client, owner, id, version: 1, expectedHash: version.hash, targets: unassigned() };
}
async function connections() {
  const targets = {};
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    const _id = new f.mongoose.Types.ObjectId(); targets[platform] = String(_id);
    await db.collection('socialconnections').insertOne({ _id, userId: new f.mongoose.Types.ObjectId(owner), provider: config.provider, accountType: config.accountType, accountName: platform, active: true });
  }
  return targets;
}
const readParent = args => db.collection('enterprisestates').findOne({ _id: service.key(owner, args.id) });
const readDrafts = () => db.collection('socialcampaigns').find({}).sort({ name: 1 }).toArray();
const body = args => ({ expectedHash: args.expectedHash, version: args.version, targets: args.targets });

test('four exact platform drafts preserve copy, checksum, attribution and approval without scheduling', async () => {
  const args = await seed(); args.targets = await connections(); const before = await readParent(args);
  const result = await service.handoffOrganic(args); assert.equal(result.platformDrafts.length, 4); assert.equal(result.execution, 'NONE');
  assert.equal(result.publicContentPublished, 'NO'); assert.equal(result.publicContentScheduled, 'NO');
  const parent = await readParent(args), drafts = await readDrafts();
  assert.equal(parent.status, 'APPROVED'); assert.equal(parent.approval.scope, SCOPE); assert.equal(parent.approval.approvedBy, owner);
  assert.deepEqual(parent.versions, before.versions); assert.equal(parent.currentVersion, before.currentVersion);
  assert.equal(new Set(drafts.map(c => c.posts[0].metadata.c0Attribution)).size, 4);
  for (const campaign of drafts) {
    const receipt = campaign.metadata.c0, post = campaign.posts[0], copy = before.versions[0].package.platformPackages[receipt.platform];
    assert.equal(campaign.status, 'draft'); assert.equal(post.publishStatus, 'draft'); assert.equal(post.scheduledTime, null);
    assert.equal(post.provider, PLATFORMS[receipt.platform].provider); assert.equal(post.format, PLATFORMS[receipt.platform].format);
    assert.equal(String(post.connectedAccountId), args.targets[receipt.platform]);
    for (const field of ['title', 'caption', 'description', 'hashtags']) assert.deepEqual(post[field], copy[field]);
    assert.equal(post.metadata.c0MediaSha256, 'a'.repeat(64)); assert.equal(post.metadata.c0Cta, copy.cta);
    assert.equal(post.metadata.c0DestinationUrl, copy.destinationUrl); assert.equal(receipt.postHash, service.postFingerprint(post));
    const hydrated = require('../models/SocialCampaign').hydrate(campaign);
    assert.equal(service.postFingerprint(hydrated.posts[0]), receipt.postHash);
    if (receipt.platform === 'tiktok') await assert.rejects(service.assertPublication({ db, campaign, post }), /C0_PLATFORM_DRAFT_ONLY/);
    else await service.assertPublication({ db, campaign, post });
  }
  const listed = (await service.list(db, owner)).items[0]; assert.deepEqual(listed.socialPlatformDrafts, result.platformDrafts);
});

test('synthetic all-true materializer checks cannot substitute for founder review', async () => {
  const args = await seed({ method: 'AUTOMATED_TECHNICAL_QA_WITH_FOUNDER_REVIEW_PENDING' });
  await assert.rejects(service.handoffOrganic(args), /FOUNDER_MEDIA_REVIEW_REQUIRED/);
  assert.equal(await db.collection('socialcampaigns').countDocuments({}), 0);
  assert.equal((await readParent(args)).status, 'FOUNDER_REVIEW');
});

test('HTTP endpoint is founder-only, rejects injected fields, and accepts an exact handoff', async () => {
  const args = await seed(), route = `/api/content-factory/${args.id}/platform-drafts`;
  assert.equal((await f.request(null, route, 'POST', body(args))).status, 401);
  assert.equal((await f.request(f.other, route, 'POST', body(args))).status, 404);
  assert.equal((await f.request(f.founder, route, 'POST', { ...body(args), owner: f.other.id })).status, 400);
  process.env.CONTENT_FACTORY_ENABLED = 'false';
  assert.equal((await f.request(f.founder, route, 'POST', body(args))).status, 404);
  process.env.CONTENT_FACTORY_ENABLED = 'true';
  assert.equal(await db.collection('socialcampaigns').countDocuments({}), 0);
  const response = await f.request(f.founder, route, 'POST', body(args)); assert.equal(response.status, 200); assert.equal(response.data.platformDrafts.length, 4);
});

test('malformed, incomplete and stale exact handoffs are rejected without writes', async () => {
  const args = await seed();
  for (const targets of [undefined, [], {}, { ...unassigned(), instagram: undefined }, { ...unassigned(), extra: null }, { ...unassigned(), facebook: 'bad' }]) {
    await assert.rejects(service.handoffOrganic({ ...args, targets }), /EXACT_PLATFORM_TARGETS_REQUIRED/);
  }
  await assert.rejects(service.handoffOrganic({ ...args, version: 2 }), /CONTENT_VERSION_CHANGED/);
  await assert.rejects(service.handoffOrganic({ ...args, expectedHash: 'b'.repeat(64) }), /CONTENT_VERSION_CHANGED/);
  assert.equal(await db.collection('socialcampaigns').countDocuments({}), 0);
});

test('account type, owner and active checks roll back the entire four-draft transaction', async () => {
  const args = await seed(); args.targets = await connections();
  const tiktokId = new f.mongoose.Types.ObjectId(args.targets.tiktok);
  for (const patch of [{ userId: new f.mongoose.Types.ObjectId(f.other.id) }, { active: false }, { accountType: 'youtube_channel' }, { provider: 'youtube' }]) {
    await db.collection('socialconnections').updateOne({ _id: tiktokId }, { $set: { userId: new f.mongoose.Types.ObjectId(owner), active: true, accountType: 'tiktok_user', provider: 'tiktok', ...patch } });
    await assert.rejects(service.handoffOrganic(args), /OWNED_PLATFORM_CONNECTION_REQUIRED/);
    assert.equal(await db.collection('socialcampaigns').countDocuments({}), 0); assert.equal((await readParent(args)).status, 'FOUNDER_REVIEW');
  }
  await assert.rejects(service.handoffOrganic({ ...args, targets: { ...args.targets, facebook: args.targets.instagram } }), /OWNED_PLATFORM_CONNECTION_REQUIRED/);
});

test('concurrent retries return the same drafts; target changes do not silently alter approval', async () => {
  const args = await seed(), [first, second] = await Promise.all([service.handoffOrganic(args), service.handoffOrganic(args)]);
  assert.deepEqual(first, second); assert.equal(await db.collection('socialcampaigns').countDocuments({}), 4);
  args.targets = await connections(); await assert.rejects(service.handoffOrganic(args), /PLATFORM_TARGETS_CHANGED/);
  assert.equal(await db.collection('socialcampaigns').countDocuments({}), 4);
});

test('all unassigned drafts remain blocked even if Social Command marks the campaign approved', async () => {
  const args = await seed(); await service.handoffOrganic(args);
  for (const campaign of await readDrafts()) {
    await assert.rejects(service.assertPublication({ db, campaign, post: campaign.posts[0] }), /C0_PLATFORM_DRAFT_ONLY/);
    await db.collection('socialcampaigns').updateOne({ _id: campaign._id }, { $set: { status: 'approved' } });
    await assert.rejects(require('../social/publishingService').publishPost({ userId: owner, campaignId: campaign._id, postId: campaign.posts[0]._id }), /C0_PLATFORM_DRAFT_ONLY/);
  }
});

test('payload, media, schedule and receipt mutations cannot cross the exact approval boundary', async () => {
  const args = await seed(); args.targets = await connections(); await service.handoffOrganic(args);
  const campaign = (await readDrafts()).find(c => c.metadata.c0.platform === 'facebook'), post = campaign.posts[0];
  for (const patch of [{ title: 'Changed' }, { caption: 'Changed' }, { description: 'Changed' }, { link: 'https://example.test/' }, { connectedAccountId: new f.mongoose.Types.ObjectId() }, { scheduledTime: new Date('2030-01-01') }, { metadata: { ...post.metadata, c0MediaSha256: 'b'.repeat(64) } }, { mediaAssets: [{ url: 'https://example.test/changed.mp4', type: 'video' }] }]) {
    await assert.rejects(service.assertPublication({ db, campaign, post: { ...post, ...patch } }), /C0_APPROVAL_INVALIDATED/);
  }
  await assert.rejects(service.assertPublication({ db, campaign: { ...campaign, _id: new f.mongoose.Types.ObjectId() }, post }), /C0_APPROVAL_INVALIDATED/);
  await assert.rejects(service.assertPublication({ db, campaign: { ...campaign, metadata: { c0: { ...campaign.metadata.c0, draftOnly: true } } }, post }), /C0_APPROVAL_INVALIDATED/);
});

test('HOLD and same-version reapproval cannot resurrect older draft approvals', async () => {
  const args = await seed(); args.targets = await connections(); await service.handoffOrganic(args);
  const old = (await readDrafts()).find(c => c.metadata.c0.platform === 'facebook');
  await service.change({ db, owner, id: args.id, expectedHash: args.expectedHash, action: 'HOLD' });
  await assert.rejects(service.assertPublication({ db, campaign: old, post: old.posts[0] }), /C0_APPROVAL_INVALIDATED/);
  await service.handoffOrganic(args);
  await assert.rejects(service.assertPublication({ db, campaign: old, post: old.posts[0] }), /C0_APPROVAL_INVALIDATED/);
  const parent = await readParent(args), freshId = parent.approval.platformDrafts.find(d => d.platform === 'facebook').campaignId;
  const fresh = await db.collection('socialcampaigns').findOne({ _id: new f.mongoose.Types.ObjectId(freshId) });
  await service.assertPublication({ db, campaign: fresh, post: fresh.posts[0] });
});

test('parent edits and rejection invalidate drafts without modifying their preserved copy', async () => {
  const args = await seed(); args.targets = await connections(); await service.handoffOrganic(args);
  const campaign = (await readDrafts()).find(c => c.metadata.c0.platform === 'facebook');
  await service.change({ db, owner, id: args.id, expectedHash: args.expectedHash, action: 'REJECT' });
  await assert.rejects(service.assertPublication({ db, campaign, post: campaign.posts[0] }), /C0_APPROVAL_INVALIDATED/);
  await assert.rejects(service.handoffOrganic(args), /CONTENT_NOT_APPROVABLE/);
  await service.change({ db, owner, id: args.id, expectedHash: args.expectedHash, action: 'EDIT', patch: { title: 'Different title' } });
  await assert.rejects(service.handoffOrganic(args), /CONTENT_VERSION_CHANGED/);
  assert.deepEqual(await db.collection('socialcampaigns').findOne({ _id: campaign._id }), campaign);
});

test('later account and voice changes invalidate platform dispatch', async () => {
  const args = await seed({ mutate: p => { p.platformPackages.facebook.caption += ' Platform-only phrase.'; } }); args.targets = await connections(); await service.handoffOrganic(args);
  const campaign = (await readDrafts()).find(c => c.metadata.c0.platform === 'facebook');
  await db.collection('socialconnections').updateOne({ _id: campaign.posts[0].connectedAccountId }, { $set: { accountType: 'instagram_professional' } });
  await assert.rejects(service.assertPublication({ db, campaign, post: campaign.posts[0] }), /OWNED_PLATFORM_CONNECTION_REQUIRED/);
  await db.collection('socialconnections').updateOne({ _id: campaign.posts[0].connectedAccountId }, { $set: { accountType: 'facebook_page' } });
  await db.collection('enterprisestates').insertOne({ _id: 'c0:voice:' + owner, owner, version: 2, rules: [{ phrase: 'Platform-only phrase', replacement: 'Alternative' }] });
  await assert.rejects(service.assertPublication({ db, campaign, post: campaign.posts[0] }), /PLATFORM_COPY_QA_NOT_PASSED/);
});

test('platform destinations must be reviewed and unique tracking preserves query and fragment', async () => {
  const args = await seed({ id: 'organic-d02-demo-domains' });
  await assert.rejects(service.handoffOrganic(args), /PLATFORM_DESTINATION_REVIEW_REQUIRED/);
  await db.collection('enterprisestates').deleteMany({});
  const url = 'https://freedom.toisouljahacademy.com/?source=demo#start';
  const verified = await seed({ id: 'organic-d02-demo-domains', mutate: p => {
    p.destination = { url, verified: true };
    for (const copy of Object.values(p.platformPackages)) copy.destinationUrl = url;
  } });
  await service.handoffOrganic(verified);
  const destinations = new Set();
  for (const campaign of await readDrafts()) {
    const post = campaign.posts[0], target = new URL(post.metadata.c0TrackedDestinationUrl);
    assert.equal(target.searchParams.get('source'), 'demo'); assert.equal(target.hash, '#start');
    assert.equal(target.searchParams.get('utm_source'), campaign.metadata.c0.platform);
    assert.equal(target.searchParams.get('utm_content'), post.metadata.c0Attribution);
    assert.equal(post.metadata.c0DestinationUrl, url); destinations.add(target.toString());
  }
  assert.equal(destinations.size, 4);
});

test('legacy single-platform approval directs organic packages to the explicit four-platform workflow', async () => {
  const args = await seed();
  await assert.rejects(service.approveMany({ db, client, owner, items: [{ id: args.id, version: args.version, hash: args.expectedHash }] }), /ORGANIC_PLATFORM_HANDOFF_REQUIRED/);
});


test('TikTok local draft cannot bypass its restriction through the separate upload endpoint', async () => {
  const args = await seed(); args.targets = await connections(); await service.handoffOrganic(args);
  const campaign = (await readDrafts()).find(c => c.metadata.c0.platform === 'tiktok');
  const response = await f.request(f.founder, `/api/social-command/campaigns/${campaign._id}/posts/${campaign.posts[0]._id}/tiktok/draft-upload`, 'POST', {});
  assert.equal(response.status, 409); assert.equal(response.data.code, 'C0_PLATFORM_DRAFT_ONLY');
  assert.deepEqual(await db.collection('socialcampaigns').findOne({ _id: campaign._id }), campaign);
});
