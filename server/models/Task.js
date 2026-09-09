const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    revision: { type: Number, default: 0 },
    goalId: mongoose.Schema.Types.ObjectId,
    intent: require('./patternSourceFields').intent,
    derivedFromPatternIds: [{type:mongoose.Schema.Types.ObjectId,ref:'Pattern'}],
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

taskSchema.index({userId:1,'intent.dueAt':1,_id:1},{name:'pattern_task_owner_due'});
taskSchema.plugin(require('./coreOwned'), {"ownerKey":"userId","references":{"protocol_id":"Protocol"},evidenceSource:'event'});

module.exports = mongoose.model("Task", taskSchema);
