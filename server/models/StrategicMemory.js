const mongoose = require("mongoose");

const strategicMemorySchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: 1 },
    source: { type: String, default: 'user', maxlength: 120 },
    sourceId: { type: String, maxlength: 200 },
    confirmed: { type: Boolean, default: true },
    revision: { type: Number, default: 1 },
    provenance: require('./patternSourceFields').provenance,
    derivedFromPatternIds: [{type:mongoose.Schema.Types.ObjectId,ref:'Pattern'}],
    legacyId: { type: String, maxlength: 100 },
    title: { type: String, required: true, trim: true },
    category: { type: String, default: "general", trim: true },
    content: { type: String, required: true, trim: true },
    sourceCommand: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

strategicMemorySchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{},evidenceSource:'event'});

module.exports = mongoose.model("StrategicMemory", strategicMemorySchema);
