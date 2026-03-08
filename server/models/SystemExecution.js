const mongoose = require("mongoose");

const systemExecutionSchema = new mongoose.Schema(
  {
    systemId: { type: mongoose.Schema.Types.ObjectId, ref: "System", required: true },
    systemName: { type: String, required: true },
    readiness: { type: String, enum: ["ready", "guarded"], default: "ready" },
    riskFlags: [String],
    actions: [String],
    signalSnapshot: {
      sleep: Number,
      stress: Number,
      symptoms: String,
      notes: String,
      createdAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemExecution", systemExecutionSchema);
