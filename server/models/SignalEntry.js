const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sleep: Number,
    stress: Number,
    symptoms: String,
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SignalEntry", signalSchema);
