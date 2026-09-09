const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    domain: { type: String, default: 'wellness', maxlength: 80 },
    observationType: { type: String, default: 'check-in', maxlength: 80 },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, default: Date.now },
    schemaVersion: { type: Number, default: 1 },
    sourceId: { type: String, maxlength: 200 },
    source: { type: String, default: 'user', maxlength: 120 },
    confirmed: { type: Boolean, default: true },
    legacyId: { type: String, maxlength: 100 },
    energy: Number,
    mood: { type: String, maxlength: 200 },
    sleep: Number,
    stress: Number,
    symptoms: String,
    notes: String,
  },
  { timestamps: true }
);

signalSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{}});

module.exports = mongoose.model("SignalEntry", signalSchema);
