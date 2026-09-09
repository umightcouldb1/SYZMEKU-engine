const mongoose = require("mongoose");

const kernelSnapshotSchema = new mongoose.Schema(
  {
    contextInvalidatedAt: { type: Date, default: null },
    singletonKey: { type: String, required: true, unique: true, default: "primary" },
    latest_output: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

kernelSnapshotSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{}});

module.exports = mongoose.model("KernelSnapshot", kernelSnapshotSchema);
