const SocialCampaign = require('../models/SocialCampaign');
const { publishPost } = require('./publishingService');

const scheduleCampaignPosts = async ({ userId, campaignId, postSchedules = [] }) => {
  const campaign = await SocialCampaign.findOne({ _id: campaignId, userId });
  if (!campaign) {
    const error = new Error('Campaign not found.');
    error.statusCode = 404;
    throw error;
  }

  if (campaign.status !== 'approved') {
    const error = new Error('Campaign must be approved before scheduling.');
    error.statusCode = 409;
    throw error;
  }

  const scheduleMap = new Map(postSchedules.map((item) => [String(item.postId), item]));
  for (const post of campaign.posts) {
    const schedule = scheduleMap.get(String(post._id));
    if (!schedule?.scheduledTime) continue;
    post.scheduledTime = new Date(schedule.scheduledTime);
    post.publishStatus = 'scheduled';
  }
  campaign.status = 'scheduled';
  campaign.scheduledAt = new Date();
  await campaign.save();
  return campaign;
};

const activatePlannedSchedule = (campaign) => {
  let scheduledCount = 0;
  const now = Date.now();

  for (const post of campaign.posts || []) {
    if (!post.scheduledTime || !post.connectedAccountId) continue;
    if (['published', 'publishing', 'skipped'].includes(post.publishStatus)) continue;
    if (post.publishStatus === 'failed' && Number(post.publishAttempts || 0) > 0) continue;

    const scheduledAt = new Date(post.scheduledTime);
    if (Number.isNaN(scheduledAt.getTime())) continue;

    post.publishStatus = 'scheduled';
    if (scheduledAt.getTime() <= now) {
      post.scheduledTime = new Date(now + 60 * 1000);
    }
    scheduledCount += 1;
  }

  if (scheduledCount > 0) {
    campaign.status = 'scheduled';
    campaign.scheduledAt = new Date();
  }

  return scheduledCount;
};

const processDuePosts = async ({ limit = 10 } = {}) => {
  const retryFailedPosts = process.env.SOCIAL_COMMAND_RETRY_FAILED_POSTS !== 'false';
  const maxAttempts = Math.max(1, Number(process.env.SOCIAL_COMMAND_MAX_PUBLISH_ATTEMPTS || 3));
  const dueStatuses = retryFailedPosts ? ['scheduled', 'failed'] : ['scheduled'];
  const now = new Date();
  const campaigns = await SocialCampaign.find({
    status: { $in: ['scheduled', 'publishing'] },
    'posts.publishStatus': { $in: dueStatuses },
    'posts.scheduledTime': { $lte: now },
  }).limit(limit);

  const results = [];
  for (const campaign of campaigns) {
    for (const post of campaign.posts) {
      const scheduledTime = post.scheduledTime ? new Date(post.scheduledTime) : null;
      const nextAttempt = post.nextPublishAttemptAt ? new Date(post.nextPublishAttemptAt) : null;
      const retryableFailure = retryFailedPosts
        && post.publishStatus === 'failed'
        && !post.providerPostId
        && Number(post.publishAttempts || 0) < maxAttempts
        && (!nextAttempt || nextAttempt <= now);
      const dueScheduledPost = post.publishStatus === 'scheduled';
      if ((dueScheduledPost || retryableFailure) && scheduledTime && scheduledTime <= now) {
        results.push(await publishPost({ userId: campaign.userId, campaignId: campaign._id, postId: post._id }).catch((error) => {
          const result = {
            error: error.message,
            campaignId: String(campaign._id),
            postId: String(post._id),
            provider: post.provider,
            format: post.format,
          };
          console.error(`[SYS_ERR] Social Command post failed: ${JSON.stringify(result)}`);
          return result;
        }));
      }
    }
  }
  return results;
};

module.exports = { scheduleCampaignPosts, activatePlannedSchedule, processDuePosts };
