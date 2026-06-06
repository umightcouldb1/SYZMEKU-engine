const mongoose = require('mongoose');

const conversationTurnSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'model'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 6000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const sovereignContextSchema = new mongoose.Schema(
  {
    sovereignMatrixNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 6000,
    },
    onboardingReflection: {
      type: String,
      default: '',
      trim: true,
      maxlength: 6000,
    },
    lifeStageChoices: {
      type: [String],
      default: [],
      set: (choices = []) =>
        Array.isArray(choices)
          ? choices.map((choice) => String(choice || '').trim()).filter(Boolean)
          : [],
    },
  },
  { _id: false }
);

const memorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    conversationHistory: {
      type: [conversationTurnSchema],
      default: [],
    },
    sovereignContext: {
      type: sovereignContextSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

memorySchema.index({ updatedAt: -1 });

memorySchema.methods.appendConversationTurns = function appendConversationTurns(turns = []) {
  const cleanTurns = turns
    .map((turn) => ({
      role: turn.role,
      text: String(turn.text || '').trim(),
      timestamp: turn.timestamp || new Date(),
    }))
    .filter((turn) => ['user', 'model'].includes(turn.role) && turn.text);

  this.conversationHistory = [...this.conversationHistory, ...cleanTurns].slice(-80);
};

module.exports = mongoose.model('Memory', memorySchema);
