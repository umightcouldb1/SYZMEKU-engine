const mongoose = require("mongoose");

const systemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    purpose: { type: String },
    inputs: [String],
    outputs: [String],
    routines: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("System", systemSchema);
