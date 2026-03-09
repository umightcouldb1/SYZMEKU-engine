const mongoose = require("mongoose");

const protocolExecutionRecordSchema = new mongoose.Schema(
  {
    protocol_name: { type: String, required: true, trim: true },
    status: { type: String, enum: ["executed", "skipped", "failed"], default: "executed" },
    details: { type: String, default: "" },
    kernel_cycle_id: { type: mongoose.Schema.Types.ObjectId, ref: "KernelCycle", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProtocolExecutionRecord", protocolExecutionRecordSchema);
