const mongoose = require('mongoose');

const workspaceConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['google_workspace'],
      default: 'google_workspace',
      index: true,
    },
    accountEmail: { type: String, default: '', index: true },
    scopes: { type: [String], default: [] },
    encryptedAccessToken: { type: String, default: '', select: false },
    encryptedRefreshToken: { type: String, default: '', select: false },
    tokenExpiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['connected', 'reauth_required', 'revoked'],
      default: 'connected',
      index: true,
    },
    connectedAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

workspaceConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('WorkspaceConnection', workspaceConnectionSchema);
