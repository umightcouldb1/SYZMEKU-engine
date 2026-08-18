const mongoose = require('mongoose');

const socialConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['meta', 'youtube', 'tiktok'],
      required: true,
      index: true,
    },
    providerAccountId: { type: String, required: true },
    accountName: { type: String, default: '' },
    accountType: {
      type: String,
      enum: ['facebook_page', 'instagram_professional', 'youtube_channel', 'tiktok_user', 'unknown'],
      default: 'unknown',
    },
    scopes: { type: [String], default: [] },
    encryptedAccessToken: { type: String, default: '', select: false },
    encryptedRefreshToken: { type: String, default: '', select: false },
    tokenExpiresAt: { type: Date, default: null },
    connectedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

socialConnectionSchema.index({ userId: 1, provider: 1, providerAccountId: 1 }, { unique: true });

module.exports = mongoose.model('SocialConnection', socialConnectionSchema);
