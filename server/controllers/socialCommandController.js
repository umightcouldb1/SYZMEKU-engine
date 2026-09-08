const asyncHandler = require('express-async-handler');
const SocialCampaign = require('../models/SocialCampaign');
const SocialConnection = require('../models/SocialConnection');
const { logAuditEvent } = require('../utils/audit');
const { encryptToken, decryptToken } = require('../social/tokenCrypto');
const { createOAuthState, consumeOAuthState } = require('../social/oauthState');
const { getProvider, listProviders } = require('../social/providers');
const { generateCampaignDraft } = require('../social/campaignGenerationService');
const { publishCampaign, publishPost } = require('../social/publishingService');
const { scheduleCampaignPosts, activatePlannedSchedule, processDuePosts } = require('../social/schedulingService');
const { refreshCampaignAnalytics, summarizeCampaign } = require('../social/analyticsService');
const { validateMediaAsset } = require('../social/mediaAssetService');

const sanitizeText = (value = '', max = 4000) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const userIdOf = (req) => req.user?._id;

const firstConfiguredOrigin = () => String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)[0];

const socialCommandReturnUrl = (params = {}) => {
  const base = process.env.SOCIAL_COMMAND_APP_URL
    || (process.env.DOMAIN ? `${process.env.DOMAIN.replace(/\/$/, '')}/app/social-command` : '')
    || (firstConfiguredOrigin() ? `${firstConfiguredOrigin().replace(/\/$/, '')}/app/social-command` : '')
    || 'http://localhost:5173/app/social-command';
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const redirectSocialCallback = (res, params) => res.redirect(302, socialCommandReturnUrl(params));

const audit = (req, event, details = {}, success = true) => logAuditEvent({
  category: 'social-command',
  event,
  req,
  userId: userIdOf(req),
  role: req.user?.role || '',
  success,
  details,
});

const serializeConnection = (connection) => ({
  id: connection._id,
  provider: connection.provider,
  providerAccountId: connection.providerAccountId,
  accountName: connection.accountName,
  accountType: connection.accountType,
  scopes: connection.scopes,
  tokenExpiresAt: connection.tokenExpiresAt,
  connectedAt: connection.connectedAt,
  updatedAt: connection.updatedAt,
  active: connection.active,
  metadata: connection.metadata,
});

const activateApprovedScheduleIfReady = async (campaign) => {
  if (!campaign || campaign.status !== 'approved') return 0;
  const scheduledCount = activatePlannedSchedule(campaign);
  if (scheduledCount > 0) await campaign.save();
  return scheduledCount;
};

const normalizeCampaignInput = (body = {}) => ({
  name: sanitizeText(body.name, 160),
  objective: sanitizeText(body.objective, 1000),
  productName: sanitizeText(body.productName, 160),
  productUrl: sanitizeText(body.productUrl, 500),
  price: sanitizeText(body.price, 80),
  targetAudience: sanitizeText(body.targetAudience, 500),
  offer: sanitizeText(body.offer, 1000),
  cta: sanitizeText(body.cta, 160),
  tone: sanitizeText(body.tone, 300),
  hook: sanitizeText(body.hook, 300),
  promise: sanitizeText(body.promise, 1000),
  platforms: Array.isArray(body.platforms) ? body.platforms.map((item) => sanitizeText(item, 40)) : [],
});

const listSocialProviders = asyncHandler(async (_req, res) => {
  res.json({ providers: listProviders() });
});

const beginAuthorization = asyncHandler(async (req, res) => {
  const provider = getProvider(req.params.provider);
  const credentials = provider.getCredentials();
  const redirectUri = credentials.redirectUri;
  const oauthState = await createOAuthState({
    userId: userIdOf(req),
    provider: provider.id,
    redirectUri,
    scopes: provider.scopes,
    usePkce: provider.id !== 'meta',
  });

  const authorizationUrl = provider.authorize(oauthState);
  res.json({
    provider: provider.id,
    authorizationUrl,
    expiresAt: oauthState.expiresAt,
    scopes: provider.scopes,
  });
});

const handleOAuthCallback = asyncHandler(async (req, res) => {
  const provider = getProvider(req.params.provider);
  if (req.query.error) {
    return redirectSocialCallback(res, {
      social_provider: provider.id,
      social_status: 'error',
      social_error: sanitizeText(req.query.error_description || req.query.error, 160),
    });
  }
  if (!req.query.code || !req.query.state) {
    return redirectSocialCallback(res, {
      social_provider: provider.id,
      social_status: 'error',
      social_error: 'missing_oauth_code_or_state',
    });
  }

  const stateRecord = await consumeOAuthState({ provider: provider.id, state: req.query.state });
  const tokenSet = await provider.handleCallback({
    code: String(req.query.code || ''),
    codeVerifier: stateRecord.codeVerifier,
  });

  const accessToken = tokenSet.access_token;
  const refreshToken = tokenSet.refresh_token || '';
  if (!accessToken) {
    return res.status(400).json({ error: 'Provider did not return an access token.' });
  }

  const accounts = await provider.getConnectedAccounts({ accessToken, refreshToken });
  const saved = [];
  for (const account of accounts.filter((item) => item.providerAccountId)) {
    const tokenExpiresAt = tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : null;
    const updated = await SocialConnection.findOneAndUpdate(
      { userId: stateRecord.userId, provider: provider.id, providerAccountId: account.providerAccountId },
      {
        userId: stateRecord.userId,
        provider: provider.id,
        providerAccountId: account.providerAccountId,
        accountName: account.accountName,
        accountType: account.accountType,
        scopes: account.scopes || stateRecord.scopes,
        encryptedAccessToken: encryptToken(account.accessToken || accessToken),
        encryptedRefreshToken: encryptToken(account.refreshToken || refreshToken),
        tokenExpiresAt,
        active: true,
        metadata: account.metadata || {},
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved.push(updated);
  }

  await audit({ ...req, user: { _id: stateRecord.userId, role: '' } }, 'account_connected', { provider: provider.id, accounts: saved.length });

  return redirectSocialCallback(res, {
    provider: provider.id,
    social_provider: provider.id,
    social_status: saved.length ? 'connected' : 'no_accounts',
    social_accounts: saved.length,
  });
});

const listConnections = asyncHandler(async (req, res) => {
  const connections = await SocialConnection.find({ userId: userIdOf(req) }).sort({ updatedAt: -1 });
  res.json({ connections: connections.map(serializeConnection) });
});

const disconnectConnection = asyncHandler(async (req, res) => {
  const connection = await SocialConnection.findOne({ _id: req.params.connectionId, userId: userIdOf(req) })
    .select('+encryptedAccessToken +encryptedRefreshToken');
  if (!connection) return res.status(404).json({ error: 'Connection not found.' });
  let revocation = { revoked: false, reason: 'No provider revocation attempted.' };
  try {
    const provider = getProvider(connection.provider);
    revocation = await provider.disconnect({
      connection,
      accessToken: decryptToken(connection.encryptedAccessToken),
      refreshToken: decryptToken(connection.encryptedRefreshToken),
    });
  } catch (error) {
    revocation = { revoked: false, reason: error.message || 'Provider revocation failed.' };
  }
  connection.active = false;
  await connection.save();
  await audit(req, 'account_disconnected', { provider: connection.provider, connectionId: connection._id, revocation });
  res.json({ success: true, connection: serializeConnection(connection), revocation });
});

const refreshConnectionToken = asyncHandler(async (req, res) => {
  const connection = await SocialConnection.findOne({ _id: req.params.connectionId, userId: userIdOf(req), active: true })
    .select('+encryptedAccessToken +encryptedRefreshToken');
  if (!connection) return res.status(404).json({ error: 'Connection not found.' });

  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  if (!refreshToken) {
    return res.status(409).json({ error: 'This provider did not return a refresh token for the connection.' });
  }

  const provider = getProvider(connection.provider);
  const tokenSet = await provider.refreshToken({ refreshToken });
  if (!tokenSet.access_token) {
    return res.status(502).json({ error: 'Provider token refresh did not return an access token.' });
  }

  connection.encryptedAccessToken = encryptToken(tokenSet.access_token);
  connection.encryptedRefreshToken = encryptToken(tokenSet.refresh_token || refreshToken);
  connection.tokenExpiresAt = tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : connection.tokenExpiresAt;
  await connection.save();
  await audit(req, 'token_refreshed', { provider: connection.provider, connectionId: connection._id });
  res.json({ success: true, connection: serializeConnection(connection) });
});

const generateCampaign = asyncHandler(async (req, res) => {
  const generated = generateCampaignDraft(normalizeCampaignInput(req.body));
  const campaign = await SocialCampaign.create({
    userId: userIdOf(req),
    ...generated,
  });
  await audit(req, 'campaign_created', { campaignId: campaign._id, templateKey: campaign.metadata?.templateKey || '' });
  res.status(201).json({ campaign, summary: summarizeCampaign(campaign) });
});

const seedFreedomAuditCampaign = asyncHandler(async (req, res) => {
  let campaign = await SocialCampaign.findOne({
    userId: userIdOf(req),
    'metadata.templateKey': 'freedom_audit_launch',
  }).sort({ createdAt: -1 });

  if (!campaign) {
    const generated = generateCampaignDraft({ productName: 'The Freedom Audit(TM)' });
    campaign = await SocialCampaign.create({ userId: userIdOf(req), ...generated });
    await audit(req, 'campaign_created', { campaignId: campaign._id, templateKey: 'freedom_audit_launch' });
  }

  res.json({ campaign, summary: summarizeCampaign(campaign), seeded: true });
});

const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await SocialCampaign.find({ userId: userIdOf(req) }).sort({ updatedAt: -1 }).limit(50);
  await Promise.all(campaigns.map(activateApprovedScheduleIfReady));
  res.json({ campaigns: campaigns.map((campaign) => ({ ...campaign.toObject(), summary: summarizeCampaign(campaign) })) });
});

const getCampaign = asyncHandler(async (req, res) => {
  const campaign = await SocialCampaign.findOne({ _id: req.params.campaignId, userId: userIdOf(req) });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  await activateApprovedScheduleIfReady(campaign);
  res.json({ campaign, summary: summarizeCampaign(campaign) });
});

const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await SocialCampaign.findOne({ _id: req.params.campaignId, userId: userIdOf(req) });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  if (req.body.name !== undefined) campaign.name = sanitizeText(req.body.name, 160);
  if (req.body.objective !== undefined) campaign.objective = sanitizeText(req.body.objective, 1000);
  if (Array.isArray(req.body.posts)) {
    campaign.posts = req.body.posts.map((post, index) => ({
      ...(campaign.posts[index]?.toObject?.() || {}),
      provider: post.provider,
      connectedAccountId: post.connectedAccountId || null,
      format: post.format || 'text',
      caption: sanitizeText(post.caption, 4000),
      title: sanitizeText(post.title, 160),
      description: sanitizeText(post.description, 5000),
      hashtags: Array.isArray(post.hashtags) ? post.hashtags.map((tag) => sanitizeText(tag, 80).replace(/^#/, '')).filter(Boolean) : [],
      link: sanitizeText(post.link, 500),
      mediaAssets: Array.isArray(post.mediaAssets) ? post.mediaAssets.map(validateMediaAsset).filter(Boolean) : [],
      metadata: post.metadata && typeof post.metadata === 'object' ? post.metadata : {},
      scheduledTime: post.scheduledTime || null,
      publishStatus: post.publishStatus || 'draft',
    }));
  }
  await campaign.save();
  res.json({ campaign, summary: summarizeCampaign(campaign) });
});

const approveCampaign = asyncHandler(async (req, res) => {
  const campaign = await SocialCampaign.findOne({ _id: req.params.campaignId, userId: userIdOf(req) });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  campaign.status = 'approved';
  campaign.approvedAt = new Date();
  campaign.posts.forEach((post) => {
    if (post.publishStatus === 'draft') post.publishStatus = 'approved';
  });
  const scheduledCount = activatePlannedSchedule(campaign);
  await campaign.save();
  await audit(req, 'campaign_approved', { campaignId: campaign._id, scheduledCount });
  res.json({ campaign, summary: summarizeCampaign(campaign) });
});

const publishNow = asyncHandler(async (req, res) => {
  try {
    const result = req.params.postId
      ? await publishPost({ userId: userIdOf(req), campaignId: req.params.campaignId, postId: req.params.postId })
      : await publishCampaign({ userId: userIdOf(req), campaignId: req.params.campaignId });
    await audit(req, 'post_published', { campaignId: req.params.campaignId });
    res.json({ success: true, result });
  } catch (error) {
    await audit(req, 'post_failed', { campaignId: req.params.campaignId, message: error.message }, false);
    throw error;
  }
});

const scheduleCampaign = asyncHandler(async (req, res) => {
  try {
    const campaign = await scheduleCampaignPosts({
      userId: userIdOf(req),
      campaignId: req.params.campaignId,
      postSchedules: Array.isArray(req.body.postSchedules) ? req.body.postSchedules : [],
    });
    await audit(req, 'schedule_created', { campaignId: campaign._id });
    res.json({ campaign, summary: summarizeCampaign(campaign) });
  } catch (error) {
    await audit(req, 'schedule_failed', { campaignId: req.params.campaignId, message: error.message }, false);
    throw error;
  }
});

const processSchedule = asyncHandler(async (req, res) => {
  const results = await processDuePosts({ limit: Math.min(25, Number(req.body.limit) || 10) });
  res.json({ success: true, results });
});

const refreshAnalytics = asyncHandler(async (req, res) => {
  const snapshots = await refreshCampaignAnalytics({ userId: userIdOf(req), campaignId: req.params.campaignId });
  const campaign = await SocialCampaign.findOne({ _id: req.params.campaignId, userId: userIdOf(req) });
  res.json({ snapshots, campaign, summary: summarizeCampaign(campaign) });
});

module.exports = {
  listSocialProviders,
  beginAuthorization,
  handleOAuthCallback,
  listConnections,
  disconnectConnection,
  refreshConnectionToken,
  generateCampaign,
  seedFreedomAuditCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  approveCampaign,
  publishNow,
  scheduleCampaign,
  processSchedule,
  refreshAnalytics,
};
