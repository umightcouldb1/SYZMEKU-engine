const mongoose = require('mongoose');

const socialAnalyticsSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialCampaign', required: true, index: true },
    postId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    provider: { type: String, enum: ['meta', 'youtube', 'tiktok'], required: true, index: true },
    providerPostId: { type: String, default: '' },
    impressions: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    watchTime: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    subscribers: { type: Number, default: 0 },
    follows: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialAnalyticsSnapshot', socialAnalyticsSnapshotSchema);
