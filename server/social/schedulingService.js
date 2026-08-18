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

const processDuePosts = async ({ limit = 10 } = {}) => {
  const campaigns = await SocialCampaign.find({
    status: { $in: ['scheduled', 'publishing'] },
    'posts.publishStatus': 'scheduled',
    'posts.scheduledTime': { $lte: new Date() },
  }).limit(limit);

  const results = [];
  for (const campaign of campaigns) {
    for (const post of campaign.posts) {
      if (post.publishStatus === 'scheduled' && post.scheduledTime && post.scheduledTime <= new Date()) {
        results.push(await publishPost({ userId: campaign.userId, campaignId: campaign._id, postId: post._id }).catch((error) => ({ error: error.message, postId: post._id })));
      }
    }
  }
  return results;
};

module.exports = { scheduleCampaignPosts, processDuePosts };
