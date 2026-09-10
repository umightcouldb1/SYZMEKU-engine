const mongoose = require("mongoose");

const kernelCycleSchema = new mongoose.Schema(
  {
    contextInvalidatedAt: { type: Date, default: null },
    trigger: { type: String, default: "loop" },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    error_summary: { type: String, default: "" },
  },
  { timestamps: true }
);

kernelCycleSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{},reasoningSource:true});

module.exports = mongoose.model("KernelCycle", kernelCycleSchema);
