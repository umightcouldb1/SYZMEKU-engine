const mongoose = require('mongoose');

const GENESIS_SEAT_LIMIT = 13000;
const PAID_GENESIS_STATUSES = ['paid', 'active'];

const genesisCounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: GENESIS_SEAT_LIMIT,
    },
  },
  { timestamps: true }
);

const genesisPatronSchema = new mongoose.Schema(
  {
    patronIdentifier: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 160,
    },
    tier: {
      type: String,
      enum: ['Genesis_Lifetime'],
      default: 'Genesis_Lifetime',
      index: true,
    },
    seatNumber: {
      type: Number,
      required: true,
      min: 1,
      max: GENESIS_SEAT_LIMIT,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['paid', 'active', 'cancelled'],
      default: 'paid',
      index: true,
    },
    source: {
      type: String,
      default: 'payment-confirmation',
      trim: true,
      maxlength: 80,
    },
    payment: {
      provider: { type: String, default: 'manual', trim: true, maxlength: 80 },
      reference: { type: String, trim: true, maxlength: 180 },
      amountCents: { type: Number, min: 0, default: 0 },
      currency: { type: String, default: 'usd', trim: true, lowercase: true, maxlength: 12 },
      paidAt: { type: Date },
    },
    metadata: {
      userAgent: { type: String, default: '', trim: true, maxlength: 300 },
      ipHash: { type: String, default: '', trim: true, maxlength: 120 },
    },
  },
  { timestamps: true }
);

genesisPatronSchema.index({ tier: 1, status: 1, seatNumber: 1 });
genesisPatronSchema.index({ 'payment.reference': 1 }, { unique: true, sparse: true });

const GenesisCounter = mongoose.model('GenesisCounter', genesisCounterSchema);
const GenesisPatron = mongoose.model('GenesisPatron', genesisPatronSchema);

module.exports = {
  GENESIS_SEAT_LIMIT,
  PAID_GENESIS_STATUSES,
  GenesisCounter,
  GenesisPatron,
};
