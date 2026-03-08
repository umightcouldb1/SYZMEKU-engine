const mongoose = require("mongoose");

const agentLoopStateSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, required: true, unique: true, default: "primary" },
    active: { type: Boolean, default: false },
    interval_ms: { type: Number, default: 60000 },
    last_run_at: { type: Date, default: null },
    run_count: { type: Number, default: 0 },
    last_error: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AgentLoopState", agentLoopStateSchema);
