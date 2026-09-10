const crypto = require('crypto');
const SocialCampaign = require('../models/SocialCampaign');
const SocialConnection = require('../models/SocialConnection');
const { decryptToken, encryptToken } = require('./tokenCrypto');
const { getProvider } = require('./providers');

const buildIdempotencyKey = ({ campaignId, postId }) =>
  crypto.createHash('sha256').update(`${campaignId}:${postId}`).digest('hex');

const assertCampaignOwner = (campaign, userId) => {
  if (!campaign || String(campaign.userId) !== String(userId)) {
    const error = new Error('Campaign not found.');
    error.statusCode = 404;
    throw error;
  }
};

const getFreshAccessToken = async ({ connection, provider }) => {
  let accessToken = decryptToken(connection.encryptedAccessToken);
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : null;
  const refreshWindowMs = Number(process.env.SOCIAL_COMMAND_TOKEN_REFRESH_WINDOW_MS || 5 * 60 * 1000);
  const shouldRefresh = Boolean(refreshToken && expiresAt && expiresAt <= Date.now() + refreshWindowMs);

  if (!shouldRefresh) return accessToken;

  const tokenSet = await provider.refreshToken({ refreshToken });
  if (!tokenSet?.access_token) {
    const error = new Error(`${provider.displayName || provider.id} token refresh did not return an access token.`);
    error.statusCode = 502;
    throw error;
  }

  accessToken = tokenSet.access_token;
  connection.encryptedAccessToken = encryptToken(accessToken);
  connection.encryptedRefreshToken = encryptToken(tokenSet.refresh_token || refreshToken);
  if (tokenSet.expires_in) {
    connection.tokenExpiresAt = new Date(Date.now() + Number(tokenSet.expires_in) * 1000);
  }
  await connection.save();
  return accessToken;
};

const publishPost = async ({ userId, campaignId, postId }) => {
  const campaign = await SocialCampaign.findById(campaignId);
  assertCampaignOwner(campaign, userId);

  if (campaign.status !== 'approved' && campaign.status !== 'scheduled' && campaign.status !== 'publishing') {
    const error = new Error('Campaign must be approved before publishing.');
    error.statusCode = 409;
    throw error;
  }

  const post = campaign.posts.id(postId);
  if (!post) {
    const error = new Error('Campaign post not found.');
    error.statusCode = 404;
    throw error;
  }

  if (post.publishStatus === 'published' && post.providerPostId) {
    return { post, skipped: true, reason: 'already_published' };
  }

  // C0 approval binds the exact prepared version and publishing payload.
  // Ordinary existing campaigns retain their existing authorization path.
  await require('../enterprise/content/service').assertPublication({ db: SocialCampaign.db.db, campaign, post });
  if (campaign.metadata?.c0) {
    await require('../enterprise/content/mediaIntegrity').verifyMediaBytes({ url: post.mediaAssets?.[0]?.url, sha256: post.metadata?.c0MediaSha256 });
  }

  const connection = await SocialConnection.findOne({
    _id: post.connectedAccountId,
    userId,
    provider: post.provider,
    active: true,
  }).select('+encryptedAccessToken +encryptedRefreshToken');

  if (!connection) {
    const error = new Error('A connected social account is required before publishing.');
    error.statusCode = 409;
    throw error;
  }

  post.idempotencyKey = post.idempotencyKey || buildIdempotencyKey({ campaignId: campaign._id, postId: post._id });
  post.publishStatus = 'publishing';
  post.publishAttempts = Number(post.publishAttempts || 0) + 1;
  post.nextPublishAttemptAt = null;
  await campaign.save();

  try {
    const provider = getProvider(post.provider);
    const accessToken = await getFreshAccessToken({ connection, provider });
    const result = post.format === 'video' || post.format === 'short' || post.format === 'reel'
      ? await provider.publishVideo({ connection, accessToken, post })
      : post.format === 'image'
        ? await provider.publishImage({ connection, accessToken, post })
        : await provider.publishText({ connection, accessToken, post });

    post.publishStatus = 'published';
    post.providerPostId = result.id || result.publish_id || result.data?.publish_id || result.data?.id || '';
    post.providerUrl = result.permalink_url || result.url || '';
    post.publishedAt = new Date();
    post.error = { message: '', code: '', at: null };
    post.nextPublishAttemptAt = null;
    await campaign.save();
    return { post, result };
  } catch (error) {
    post.publishStatus = 'failed';
    post.error = {
      message: error.message || 'Publishing failed.',
      code: String(error.statusCode || error.code || ''),
      at: new Date(),
    };
    const retryDelayMinutes = Math.max(5, Number(process.env.SOCIAL_COMMAND_RETRY_DELAY_MINUTES || 15));
    post.nextPublishAttemptAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000);
    await campaign.save();
    throw error;
  }
};

const publishCampaign = async ({ userId, campaignId }) => {
  const campaign = await SocialCampaign.findById(campaignId);
  assertCampaignOwner(campaign, userId);
  const results = [];
  for (const post of campaign.posts) {
    if (!post.connectedAccountId || post.scheduledTime) continue;
    results.push(await publishPost({ userId, campaignId, postId: post._id }));
  }
  return results;
};

module.exports = { publishPost, publishCampaign, buildIdempotencyKey };
