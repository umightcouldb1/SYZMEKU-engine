const mongoose = require("mongoose");

const kernelCycleSchema = new mongoose.Schema(
  {
    trigger: { type: String, default: "loop" },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    error_summary: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("KernelCycle", kernelCycleSchema);
