const crypto = require('node:crypto');
const { hash, qa } = require('./qa');
const { voiceCheck } = require('./voice');

const SCOPE = 'EXACT_ORGANIC_HANDOFF_TO_SOCIAL_DRAFTS';
const PLATFORMS = Object.freeze({
  facebook: { provider: 'meta', accountType: 'facebook_page', format: 'video' },
  instagram: { provider: 'meta', accountType: 'instagram_professional', format: 'reel' },
  youtube: { provider: 'youtube', accountType: 'youtube_channel', format: 'short' },
  tiktok: { provider: 'tiktok', accountType: 'tiktok_user', format: 'video' },
});
const fail = (code, status = 409) => { const error = new Error(code); error.statusCode = status; throw error; };
const current = doc => doc.versions.find(v => v.number === doc.currentVersion);
const key = (owner, id) => `c0:item:${owner}:${id}`;

function validateTargets(targets) {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)
    || Object.keys(targets).length !== 4
    || Object.keys(targets).some(platform => !Object.hasOwn(PLATFORMS, platform))
    || Object.keys(PLATFORMS).some(platform => targets[platform] !== null
      && (typeof targets[platform] !== 'string' || !/^[a-f0-9]{24}$/.test(targets[platform])))) {
    fail('EXACT_PLATFORM_TARGETS_REQUIRED', 400);
  }
}

function validateCopy(p, rules) {
  for (const platform of Object.keys(PLATFORMS)) {
    const copy = p.platformPackages?.[platform];
    if (!copy || ['title', 'caption', 'description', 'cta', 'openingHook', 'coverText'].some(field =>
      typeof copy[field] !== 'string' || !copy[field].trim() || copy[field].length > 5000)
      || !Array.isArray(copy.hashtags) || copy.hashtags.length > 30
      || copy.hashtags.some(tag => typeof tag !== 'string' || tag.length > 100)) {
      fail('COMPLETE_PLATFORM_COPY_REQUIRED');
    }
    const text = [copy.title, copy.caption, copy.description, copy.cta, copy.openingHook, copy.coverText].join('\n');
    if (voiceCheck(text, rules, p.approvalExceptions || [], p).status !== 'PASS') fail('PLATFORM_COPY_QA_NOT_PASSED');
    if (copy.destinationUrl !== null) {
      let url;
      try { url = new URL(copy.destinationUrl); } catch { fail('UNAPPROVED_PLATFORM_DESTINATION'); }
      if (url.origin !== 'https://freedom.toisouljahacademy.com' || url.username || url.password) fail('UNAPPROVED_PLATFORM_DESTINATION');
      // A parent with no destination is not evidence that its platform-specific offer link was reviewed.
      if (p.destination?.url !== copy.destinationUrl || p.destination?.verified !== true) fail('PLATFORM_DESTINATION_REVIEW_REQUIRED');
    }
  }
}

function trackedDestination(url, platform, attribution) {
  if (!url) return '';
  const target = new URL(url);
  target.searchParams.set('utm_source', platform);
  target.searchParams.set('utm_medium', 'social');
  target.searchParams.set('utm_campaign', 'freedom_audit_launch');
  target.searchParams.set('utm_content', attribution);
  return target.toString();
}

async function handoffOrganic({ db, client, owner, id, expectedHash, version, targets, postFingerprint }) {
  if (typeof id !== 'string' || !Number.isInteger(version) || !/^[a-f0-9]{64}$/.test(expectedHash)) fail('EXACT_VERSION_REQUIRED', 400);
  validateTargets(targets);
  const { ObjectId } = require('mongoose').mongo;
  const session = client.startSession(), targetsHash = hash(targets);
  let result;
  try {
    await session.withTransaction(async () => {
      const states = db.collection('enterprisestates');
      const doc = await states.findOne({ _id: key(owner, id), owner }, { session });
      if (!doc) fail('NOT_FOUND', 404);
      const v = current(doc), p = v.package;
      if (v.number !== version || v.hash !== expectedHash) fail('CONTENT_VERSION_CHANGED');
      if (p.platform !== 'organic') fail('ORGANIC_PARENT_REQUIRED', 400);
      if (doc.status === 'APPROVED' && doc.approval?.scope === SCOPE && doc.approval.hash === expectedHash) {
        if (doc.approval.targetsHash !== targetsHash) fail('PLATFORM_TARGETS_CHANGED');
        result = doc.approval.platformDrafts;
        return;
      }
      if (!['DRAFT', 'HOLD', 'FOUNDER_REVIEW'].includes(doc.status)) fail('CONTENT_NOT_APPROVABLE');
      if (p.production?.review?.method !== 'FOUNDER_ATTESTATION' || p.production.review.by !== owner) fail('FOUNDER_MEDIA_REVIEW_REQUIRED');
      const learned = await states.findOne({ _id: 'c0:voice:' + owner, owner }, { session });
      const rules = learned?.rules || [];
      if (!qa(p, rules).canApprove) fail('QA_NOT_PASSED');
      validateCopy(p, rules);
      const now = new Date(), handoffId = crypto.randomUUID();
      const approval = { hash: expectedHash, version, approvedBy: owner, approvedAt: now, scope: SCOPE, handoffId, targetsHash };
      const drafts = [];
      for (const [platform, config] of Object.entries(PLATFORMS)) {
        const connectionId = targets[platform];
        if (connectionId) {
          const connection = await db.collection('socialconnections').findOne({
            _id: new ObjectId(connectionId), userId: new ObjectId(owner), active: true,
            provider: config.provider, accountType: config.accountType,
          }, { session });
          if (!connection) fail('OWNED_PLATFORM_CONNECTION_REQUIRED');
        }
        const copy = p.platformPackages[platform], attribution = `${p.attribution}_${platform}`;
        const destination = trackedDestination(copy.destinationUrl, platform, attribution);
        const draftOnly = platform === 'tiktok' || !connectionId;
        const campaignId = new ObjectId(), post = {
          _id: new ObjectId(), provider: config.provider, format: config.format,
          connectedAccountId: connectionId ? new ObjectId(connectionId) : null,
          title: copy.title, caption: copy.caption, description: copy.description, hashtags: [...copy.hashtags],
          link: platform === 'facebook' ? destination : '',
          mediaAssets: [{ url: p.production.media.url, type: 'video' }],
          metadata: {
            c0MediaSha256: p.production.media.sha256, c0Platform: platform, c0Attribution: attribution,
            c0ParentAttribution: p.attribution, c0DestinationUrl: copy.destinationUrl,
            c0TrackedDestinationUrl: destination, c0Cta: copy.cta,
            c0OpeningHook: copy.openingHook, c0CoverText: copy.coverText,
          },
          scheduledTime: null, publishStatus: 'draft',
        };
        const postHash = postFingerprint(post);
        const receipt = { itemId: id, ...approval, platform, draftOnly, postHash };
        await db.collection('socialcampaigns').insertOne({
          _id: campaignId, userId: new ObjectId(owner), name: `C0 · ${platform} · ${copy.title}`,
          objective: p.purpose, sourceProduct: 'T.O.I. education', status: 'draft', posts: [post],
          metadata: { c0: receipt }, createdAt: now, updatedAt: now,
        }, { session });
        drafts.push({ platform, campaignId: String(campaignId), postId: String(post._id), connectionId, postHash, draftOnly });
      }
      const changed = await states.updateOne({ _id: doc._id, owner, currentVersion: version, status: doc.status }, {
        $set: { status: 'APPROVED', approval: { ...approval, platformDrafts: drafts }, socialPlatformDrafts: drafts, founderActionAt: now, updatedAt: now },
      }, { session });
      if (!changed.modifiedCount) fail('CONTENT_VERSION_CHANGED');
      result = drafts;
    });
    return { id, platformDrafts: result, execution: 'NONE', publicContentPublished: 'NO', publicContentScheduled: 'NO' };
  } finally { await session.endSession(); }
}

async function assertOrganicReceipt({ db, doc, campaign, post, receipt, rules }) {
  const approval = doc.approval;
  if (approval?.scope !== SCOPE || receipt.scope !== SCOPE || approval.handoffId !== receipt.handoffId
    || !approval.platformDrafts?.some(draft => draft.platform === receipt.platform
      && draft.campaignId === String(campaign._id) && draft.postId === String(post._id)
      && draft.postHash === receipt.postHash && draft.draftOnly === receipt.draftOnly)) fail('C0_APPROVAL_INVALIDATED');
  if (receipt.draftOnly || receipt.platform === 'tiktok' || !post.connectedAccountId) fail('C0_PLATFORM_DRAFT_ONLY');
  const p = current(doc).package;
  if (p.production?.review?.method !== 'FOUNDER_ATTESTATION' || p.production.review.by !== doc.owner) fail('C0_APPROVAL_INVALIDATED');
  validateCopy(p, rules);
  const { ObjectId } = require('mongoose').mongo, config = PLATFORMS[receipt.platform];
  const connection = await db.collection('socialconnections').findOne({
    _id: new ObjectId(String(post.connectedAccountId)), userId: new ObjectId(doc.owner), active: true,
    provider: config.provider, accountType: config.accountType,
  });
  if (!connection) fail('OWNED_PLATFORM_CONNECTION_REQUIRED');
}

module.exports = { handoffOrganic, assertOrganicReceipt, SCOPE, PLATFORMS };
