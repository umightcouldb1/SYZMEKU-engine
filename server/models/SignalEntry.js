const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema(
  {
    revision: { type: Number, default: 0 },
    provenance: require('./patternSourceFields').provenance,
    event: require('./patternSourceFields').event,
    eventKey: String,
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

signalSchema.index({userId:1,occurredAt:1,_id:1},{name:'pattern_signal_owner_time'});
signalSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{},evidenceSource:'event'});

module.exports = mongoose.model("SignalEntry", signalSchema);
