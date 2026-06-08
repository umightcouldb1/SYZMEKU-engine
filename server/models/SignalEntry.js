const mongoose = require("mongoose");
const { getRequestContext } = require("../utils/requestContext");

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

signalSchema.pre("validate", function setSignalUserScope(next) {
  const { userId } = getRequestContext();
  if (!this.userId && userId) this.userId = userId;
  next();
});

signalSchema.pre(/^find/, function filterSignalsByUser(next) {
  const { userId } = getRequestContext();
  if (userId && !this.getFilter().userId) this.where({ userId });
  next();
});

signalSchema.pre("countDocuments", function countSignalsByUser(next) {
  const { userId } = getRequestContext();
  if (userId && !this.getFilter().userId) this.where({ userId });
  next();
});

module.exports = mongoose.model("SignalEntry", signalSchema);
