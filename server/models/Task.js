const mongoose = require("mongoose");
const { getRequestContext } = require("../utils/requestContext");

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ["open", "done"], default: "open" },
    source: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.pre("validate", function setTaskUserScope(next) {
  const { userId } = getRequestContext();
  if (!this.userId && userId) this.userId = userId;
  next();
});

taskSchema.pre(/^find/, function filterTasksByUser(next) {
  const { userId } = getRequestContext();
  if (userId && !this.getFilter().userId) this.where({ userId });
  next();
});

taskSchema.pre("countDocuments", function countTasksByUser(next) {
  const { userId } = getRequestContext();
  if (userId && !this.getFilter().userId) this.where({ userId });
  next();
});

module.exports = mongoose.model("Task", taskSchema);
