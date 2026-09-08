const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
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
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const mediaAssetSchema = new mongoose.Schema(
  {
    assetId: { type: String, default: '' },
    url: { type: String, default: '' },
    type: { type: String, enum: ['image', 'video', 'link', 'unknown'], default: 'unknown' },
    mimeType: { type: String, default: '' },
    altText: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['meta', 'youtube', 'tiktok'], required: true },
    connectedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialConnection', default: null },
    format: {
      type: String,
      enum: ['text', 'image', 'video', 'short', 'reel', 'story', 'unknown'],
      default: 'text',
    },
    caption: { type: String, default: '' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    hashtags: { type: [String], default: [] },
    link: { type: String, default: '' },
    mediaAssets: { type: [mediaAssetSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    scheduledTime: { type: Date, default: null },
    publishStatus: {
      type: String,
      enum: ['draft', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'skipped'],
      default: 'draft',
      index: true,
    },
    providerPostId: { type: String, default: '' },
    providerUrl: { type: String, default: '' },
    error: {
      message: { type: String, default: '' },
      code: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    publishAttempts: { type: Number, default: 0 },
    nextPublishAttemptAt: { type: Date, default: null },
    analytics: { type: analyticsSchema, default: () => ({}) },
    idempotencyKey: { type: String, default: '', index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const socialCampaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    objective: { type: String, default: '' },
    sourceProduct: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'generated', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'archived'],
      default: 'draft',
      index: true,
    },
    approvedAt: { type: Date, default: null },
    scheduledAt: { type: Date, default: null },
    posts: { type: [postSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialCampaign', socialCampaignSchema);
