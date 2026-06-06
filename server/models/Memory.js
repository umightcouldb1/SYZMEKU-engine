const mongoose = require('mongoose');

const biometricMetricSchema = new mongoose.Schema(
  {
    status: { type: String, default: 'unavailable', trim: true },
    label: { type: String, default: 'Unavailable', trim: true },
    sampleCount: { type: Number, default: 0 },
    amplitudeStability: { type: Number, default: null },
    pitchVariance: { type: Number, default: null },
    rhythm: { type: String, default: '', trim: true },
    dwellAverageMs: { type: Number, default: null },
    flightAverageMs: { type: Number, default: null },
    blinkFrequencyPerMinute: { type: Number, default: null },
    motionVelocity: { type: Number, default: null },
    sleepHours: { type: Number, default: null },
    stressLevel: { type: Number, default: null },
    symptoms: { type: String, default: '', trim: true },
    error: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false, strict: false }
);

const biometricMetadataSchema = new mongoose.Schema(
  {
    capturedAt: { type: Date, default: Date.now },
    coherenceScore: { type: Number, default: null },
    coherenceLabel: { type: String, default: 'Unknown', trim: true },
    acoustic: { type: biometricMetricSchema, default: () => ({}) },
    kinetic: { type: biometricMetricSchema, default: () => ({}) },
    visual: { type: biometricMetricSchema, default: () => ({}) },
    contextual: { type: biometricMetricSchema, default: () => ({}) },
    guidance: { type: [String], default: [] },
  },
  { _id: false, strict: false }
);

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
    biometricMetadata: {
      type: biometricMetadataSchema,
      default: undefined,
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
      ...(turn.biometricMetadata ? { biometricMetadata: turn.biometricMetadata } : {}),
    }))
    .filter((turn) => ['user', 'model'].includes(turn.role) && turn.text);

  this.conversationHistory = [...this.conversationHistory, ...cleanTurns].slice(-80);
};

module.exports = mongoose.model('Memory', memorySchema);
