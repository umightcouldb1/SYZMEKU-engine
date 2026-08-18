const mongoose = require('mongoose');

const socialOAuthStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['meta', 'youtube', 'tiktok'], required: true },
    stateHash: { type: String, required: true, unique: true, index: true },
    codeVerifier: { type: String, default: '', select: false },
    redirectUri: { type: String, required: true },
    scopes: { type: [String], default: [] },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialOAuthState', socialOAuthStateSchema);
