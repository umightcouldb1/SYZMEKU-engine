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
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
