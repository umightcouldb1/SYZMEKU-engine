const mongoose = require("mongoose");

const systemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    purpose: { type: String },
    protocolType: { type: String, default: "generic" },
    protocolRules: { type: [String], default: [] },
    recommendedActions: { type: [String], default: [] },
    inputs: [String],
    outputs: [String],
    routines: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("System", systemSchema);
