const mongoose = require("mongoose");

const kernelSnapshotSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, required: true, unique: true, default: "primary" },
    latest_output: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("KernelSnapshot", kernelSnapshotSchema);
