const mongoose = require("mongoose");

const strategicMemorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, default: "general", trim: true },
    content: { type: String, required: true, trim: true },
    sourceCommand: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StrategicMemory", strategicMemorySchema);
