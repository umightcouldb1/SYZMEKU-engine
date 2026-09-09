const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: '', maxlength: 500 },
    protocol_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Protocol' },
    legacyId: { type: String, maxlength: 100 },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ["open", "done"], default: "open" },
    source: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{"protocol_id":"Protocol"}});

module.exports = mongoose.model("Task", taskSchema);
