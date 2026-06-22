const mongoose = require('mongoose');

const capitalLedgerEntrySchema = new mongoose.Schema(
  {
    route: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: 120,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: 120,
    },
    schemaVersion: {
      type: String,
      default: 'unknown',
      trim: true,
      maxlength: 40,
    },
    transaction: {
      status: { type: String, default: 'received', trim: true, lowercase: true, maxlength: 80 },
      currency: { type: String, default: 'usd', trim: true, lowercase: true, maxlength: 12 },
      amountCents: { type: Number, default: 0, min: 0 },
      source: { type: String, default: 'make_webhook', trim: true, maxlength: 120 },
      externalReference: { type: String, trim: true, maxlength: 220, index: true },
      provider: { type: String, default: 'make', trim: true, maxlength: 80 },
    },
    client: {
      status: { type: String, default: 'pending_profile_match', trim: true, lowercase: true, maxlength: 100 },
      source: { type: String, default: 'syzmeku_local_daemon', trim: true, maxlength: 120 },
      identifier: { type: String, trim: true, lowercase: true, maxlength: 180, index: true },
      profileStage: { type: String, trim: true, maxlength: 120 },
    },
    fulfillment: {
      alertRequired: { type: Boolean, default: false },
      queue: { type: String, default: 'basis_capital_distribution', trim: true, maxlength: 120 },
      status: { type: String, default: 'queued', trim: true, lowercase: true, maxlength: 80 },
    },
    tracking: {
      repo: { type: String, trim: true, maxlength: 120 },
      backupRoot: { type: String, trim: true, maxlength: 260 },
      jobId: { type: String, trim: true, maxlength: 180, index: true },
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    receivedFrom: {
      type: String,
      default: 'make',
      trim: true,
      maxlength: 80,
    },
  },
  { timestamps: true }
);

capitalLedgerEntrySchema.index(
  { 'transaction.externalReference': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'transaction.externalReference': { $type: 'string' },
    },
  }
);

capitalLedgerEntrySchema.index({ route: 1, eventType: 1, createdAt: -1 });
capitalLedgerEntrySchema.index({ 'fulfillment.queue': 1, 'fulfillment.status': 1, createdAt: -1 });

module.exports = mongoose.model('CapitalLedgerEntry', capitalLedgerEntrySchema);
