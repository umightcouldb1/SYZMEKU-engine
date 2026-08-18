const mongoose = require('mongoose');

const purchasedProductSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    priceId: { type: String, default: '' },
    name: { type: String, default: '' },
    tier: { type: String, default: 'public' },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'usd' },
    checkoutSessionId: { type: String, default: '' },
    purchasedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'canceled'],
      default: 'paid',
    },
  },
  { _id: false }
);

const profilePreferenceSchema = new mongoose.Schema(
  {
    prismIntensity: { type: Number, min: 0, max: 100, default: 72 },
    glassDensity: { type: Number, min: 0, max: 100, default: 58 },
    motionEnabled: { type: Boolean, default: true },
    accent: {
      type: String,
      enum: ['cyan', 'violet', 'gold', 'emerald', 'rose'],
      default: 'cyan',
    },
    interfaceMode: {
      type: String,
      enum: ['crystalline', 'iridescent', 'minimal'],
      default: 'crystalline',
    },
  },
  { _id: false }
);

const freedomAuditResultSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 0, max: 100, required: true },
    stage: {
      type: String,
      enum: ['Survive', 'Stabilize', 'Liberate', 'Expand'],
      required: true,
    },
    weakestDomain: { type: String, required: true },
    highestLeveragePriority: { type: String, required: true },
    domainScores: {
      time: { type: Number, min: 0, max: 100, required: true },
      money: { type: Number, min: 0, max: 100, required: true },
      obligations: { type: Number, min: 0, max: 100, required: true },
      assets: { type: Number, min: 0, max: 100, required: true },
      desires: { type: Number, min: 0, max: 100, required: true },
    },
    leverageMoves: { type: [String], default: [] },
    compression: {
      delete: { type: String, default: '' },
      automate: { type: String, default: '' },
      delegate: { type: String, default: '' },
      execute: { type: String, default: '' },
    },
    liberationPlan: { type: [String], default: [] },
    bigSyzPrompt: { type: String, default: '' },
    inputs: {
      ratings: { type: mongoose.Schema.Types.Mixed, default: {} },
      win: { type: String, default: '' },
      drag: { type: String, default: '' },
      asset: { type: String, default: '' },
    },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    tier: { type: String, default: 'public', index: true },
    purchasedProducts: { type: [purchasedProductSchema], default: [] },
    preferences: { type: profilePreferenceSchema, default: () => ({}) },
    freedomAudit: {
      latestResult: { type: freedomAuditResultSchema, default: null },
      results: { type: [freedomAuditResultSchema], default: [] },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
