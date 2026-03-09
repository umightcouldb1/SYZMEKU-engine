const mongoose = require("mongoose");

const actionExecutionSchema = new mongoose.Schema(
  {
    action_name: { type: String, required: true, trim: true },
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    success: { type: Boolean, default: false },
    error: { type: String, default: "" },
    follow_up_needed: { type: Boolean, default: false },
    source: { type: String, default: "action-kernel", trim: true },
    reasoning_cycle_id: { type: mongoose.Schema.Types.ObjectId, ref: "KernelCycle", default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActionExecution", actionExecutionSchema);
