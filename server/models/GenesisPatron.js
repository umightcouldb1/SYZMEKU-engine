const mongoose = require('mongoose');

const GENESIS_SEAT_LIMIT = 13000;

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
      enum: ['reserved', 'payment_pending', 'active', 'cancelled'],
      default: 'reserved',
      index: true,
    },
    source: {
      type: String,
      default: 'genesis-lock',
      trim: true,
      maxlength: 80,
    },
    metadata: {
      userAgent: { type: String, default: '', trim: true, maxlength: 300 },
      ipHash: { type: String, default: '', trim: true, maxlength: 120 },
    },
  },
  { timestamps: true }
);

genesisPatronSchema.index({ tier: 1, status: 1, seatNumber: 1 });

const GenesisCounter = mongoose.model('GenesisCounter', genesisCounterSchema);
const GenesisPatron = mongoose.model('GenesisPatron', genesisPatronSchema);

module.exports = {
  GENESIS_SEAT_LIMIT,
  GenesisCounter,
  GenesisPatron,
};
