const assert = require('assert');
const mongoose = require('mongoose');

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || 'local-social-command-test-key';

const { encryptToken, decryptToken } = require('../social/tokenCrypto');
const { sha256 } = require('../social/oauthState');
const { generateCampaignDraft, withUtm } = require('../social/campaignGenerationService');
const { normalizeProviderAnalytics, summarizeCampaign } = require('../social/analyticsService');
const { listProviders } = require('../social/providers');
const { buildIdempotencyKey } = require('../social/publishingService');
const { assertAllowedHttpsUrl } = require('../social/mediaAssetService');
const SocialConnection = require('../models/SocialConnection');
const SocialCampaign = require('../models/SocialCampaign');

const run = async () => {
  const encrypted = encryptToken('secret-provider-token');
  assert.notStrictEqual(encrypted, 'secret-provider-token', 'provider tokens must be encrypted at rest');
  assert.strictEqual(decryptToken(encrypted), 'secret-provider-token', 'encrypted provider token should decrypt');

  const rawState = 'state-value';
  assert.notStrictEqual(sha256(rawState), rawState, 'OAuth state is stored as a hash, not raw state');
  assert.strictEqual(sha256(rawState), sha256(rawState), 'OAuth state hashing should be deterministic');

  const providers = listProviders();
  assert.deepStrictEqual(providers.map((provider) => provider.id).sort(), ['meta', 'tiktok', 'youtube']);
  assert(providers.every((provider) => provider.scopes.length > 0), 'each provider declares official OAuth scopes');
  assert(providers.every((provider) => !provider.capabilities.browserAutomation), 'providers must not expose browser automation publishing');

  const campaign = generateCampaignDraft({ productName: 'The Freedom Audit(TM)' });
  assert.strictEqual(campaign.metadata.templateKey, 'freedom_audit_launch');
  assert(campaign.posts.some((post) => post.provider === 'meta' && /facebook/.test(post.link)), 'Freedom Audit has Facebook UTM copy');
  assert(campaign.posts.some((post) => post.provider === 'youtube'), 'Freedom Audit has YouTube draft copy');
  assert(campaign.posts.some((post) => post.provider === 'tiktok'), 'Freedom Audit has TikTok draft copy');
  assert(withUtm('https://example.com/a', 'meta').includes('utm_source=meta'), 'UTM helper adds source tracking');

  const analytics = normalizeProviderAnalytics('meta', {
    data: [
      { name: 'post_impressions', values: [{ value: 10 }] },
      { name: 'post_clicks', values: [{ value: 3 }] },
      { name: 'post_reactions_like_total', values: [{ value: 2 }] },
    ],
  });
  assert.strictEqual(analytics.impressions, 10);
  assert.strictEqual(analytics.clicks, 3);
  assert.strictEqual(analytics.likes, 2);

  const idempotencyA = buildIdempotencyKey({ campaignId: 'campaign', postId: 'post' });
  const idempotencyB = buildIdempotencyKey({ campaignId: 'campaign', postId: 'post' });
  const idempotencyC = buildIdempotencyKey({ campaignId: 'campaign', postId: 'different' });
  assert.strictEqual(idempotencyA, idempotencyB, 'publish idempotency key should be stable per campaign/post');
  assert.notStrictEqual(idempotencyA, idempotencyC, 'publish idempotency key should vary by post');

  assert.doesNotThrow(() => assertAllowedHttpsUrl('https://cdn.example.com/a.mp4'), 'public HTTPS media URLs should be allowed');
  assert.throws(() => assertAllowedHttpsUrl('http://cdn.example.com/a.mp4'), /HTTPS/, 'media URL validation should reject HTTP');
  assert.throws(() => assertAllowedHttpsUrl('https://localhost/a.mp4'), /public hostname/, 'media URL validation should reject localhost');
  assert.throws(() => assertAllowedHttpsUrl('https://127.0.0.1/a.mp4'), /private or reserved/, 'media URL validation should reject loopback IPs');
  const previousAllowedHosts = process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
  process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS = 'assets.example.com';
  assert.doesNotThrow(() => assertAllowedHttpsUrl('https://cdn.assets.example.com/a.mp4'), 'media allowlist should include subdomains');
  assert.throws(() => assertAllowedHttpsUrl('https://evil.example.com/a.mp4'), /allowlist/, 'media allowlist should reject unlisted hosts');
  if (previousAllowedHosts === undefined) {
    delete process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
  } else {
    process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS = previousAllowedHosts;
  }

  const invalidConnection = new SocialConnection({
    provider: 'meta',
    providerAccountId: 'page-1',
    accountName: 'Page',
    encryptedAccessToken: encrypted,
  });
  const validationError = invalidConnection.validateSync();
  assert(validationError?.errors?.userId, 'connections require a user owner');

  const userId = new mongoose.Types.ObjectId();
  const validCampaign = new SocialCampaign({
    userId,
    name: 'Harness Campaign',
    posts: [{ provider: 'meta', format: 'text', caption: 'copy', analytics: { impressions: 4 } }],
  });
  assert.doesNotThrow(() => validCampaign.validateSync(), 'campaign model should validate a minimal owned campaign');
  assert.strictEqual(summarizeCampaign(validCampaign).impressions, 4);

  await mongoose.disconnect();
  console.log('social-command harness passed');
};

run().catch(async (error) => {
  await mongoose.disconnect().catch(() => {});
  console.error(error);
  process.exit(1);
});
