const SocialAnalyticsSnapshot = require('../models/SocialAnalyticsSnapshot');
const SocialCampaign = require('../models/SocialCampaign');
const SocialConnection = require('../models/SocialConnection');
const { decryptToken } = require('./tokenCrypto');
const { getProvider } = require('./providers');

const emptyMetrics = () => ({
  impressions: 0,
  views: 0,
  reach: 0,
  clicks: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  watchTime: 0,
  saves: 0,
  subscribers: 0,
  follows: 0,
});

const normalizeProviderAnalytics = (provider, raw = {}) => {
  const metrics = emptyMetrics();
  const entries = raw.data || raw.items || [];
  for (const entry of entries) {
    const name = entry.name || entry.id || '';
    const value = Number(entry.values?.[0]?.value || entry.value || 0);
    if (/impression/i.test(name)) metrics.impressions += value;
    if (/view/i.test(name)) metrics.views += value;
    if (/reach|unique/i.test(name)) metrics.reach += value;
    if (/click/i.test(name)) metrics.clicks += value;
    if (/like|reaction/i.test(name)) metrics.likes += value;
    if (/comment/i.test(name)) metrics.comments += value;
    if (/share/i.test(name)) metrics.shares += value;
    if (/saved|save/i.test(name)) metrics.saves += value;
  }
  metrics.provider = provider;
  return metrics;
};

const refreshCampaignAnalytics = async ({ userId, campaignId }) => {
  const campaign = await SocialCampaign.findOne({ _id: campaignId, userId });
  if (!campaign) {
    const error = new Error('Campaign not found.');
    error.statusCode = 404;
    throw error;
  }

  const snapshots = [];
  for (const post of campaign.posts) {
    if (!post.providerPostId || !post.connectedAccountId) continue;
    const connection = await SocialConnection.findOne({ _id: post.connectedAccountId, userId, active: true }).select('+encryptedAccessToken');
    if (!connection) continue;
    const provider = getProvider(post.provider);
    const raw = await provider.getAnalytics({
      connection,
      accessToken: decryptToken(connection.encryptedAccessToken),
      post,
    });
    const metrics = normalizeProviderAnalytics(post.provider, raw);
    post.analytics = { ...post.analytics, ...metrics, timestamp: new Date() };
    snapshots.push(await SocialAnalyticsSnapshot.create({
      userId,
      campaignId: campaign._id,
      postId: post._id,
      provider: post.provider,
      providerPostId: post.providerPostId,
      ...metrics,
      raw,
    }));
  }
  await campaign.save();
  return snapshots;
};

const summarizeCampaign = (campaign) => {
  const totals = emptyMetrics();
  for (const post of campaign.posts || []) {
    for (const key of Object.keys(totals)) {
      totals[key] += Number(post.analytics?.[key] || 0);
    }
  }
  return {
    publishedPosts: (campaign.posts || []).filter((post) => post.publishStatus === 'published').length,
    totalPosts: (campaign.posts || []).length,
    ...totals,
  };
};

module.exports = { refreshCampaignAnalytics, summarizeCampaign, normalizeProviderAnalytics };
