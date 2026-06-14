const mongoose = require('mongoose');

const automationAssetSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['google_slides', 'gmail', 'gemini', 'internal'],
      default: 'internal',
    },
    assetType: {
      type: String,
      enum: ['presentation', 'gmail_draft', 'text_outline', 'text_draft', 'other'],
      default: 'other',
    },
    assetId: { type: String, default: '' },
    messageId: { type: String, default: '' },
    url: { type: String, default: '' },
    title: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const automationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    command: {
      type: String,
      enum: ['partnership_deck_draft', 'partnership_outreach_draft'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['started', 'succeeded', 'failed'],
      default: 'started',
      index: true,
    },
    mode: { type: String, default: '' },
    request: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    resultSummary: { type: String, default: '' },
    assets: { type: [automationAssetSchema], default: [] },
    error: {
      message: { type: String, default: '' },
      code: { type: String, default: '' },
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

automationLogSchema.index({ userId: 1, createdAt: -1 });
automationLogSchema.index({ command: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AutomationLog', automationLogSchema);
