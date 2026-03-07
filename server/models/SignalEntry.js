const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema(
  {
    sleep: Number,
    stress: Number,
    symptoms: String,
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SignalEntry", signalSchema);
