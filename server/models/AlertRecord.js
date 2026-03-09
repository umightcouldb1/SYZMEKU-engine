const mongoose = require("mongoose");

const alertRecordSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true },
    message: { type: String, required: true, trim: true },
    severity: { type: String, default: "medium", trim: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    source: { type: String, default: "kernel", trim: true },
    count: { type: Number, default: 1 },
    last_seen_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AlertRecord", alertRecordSchema);
