const mongoose = require('mongoose');

const sourcedText = new mongoose.Schema({
  description: { type: String, required: true, maxlength: 2000 },
  kind: { type: String, default: 'general', maxlength: 80 },
  hard: { type: Boolean, default: false },
  validUntil: Date,
  source: { type: String, default: 'user', maxlength: 120 },
}, { _id: true });
const goalSchema = new mongoose.Schema({
  description: { type: String, required: true, maxlength: 2000 },
  domain: { type: String, default: 'life', maxlength: 80 },
  successMeasure: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['active', 'paused', 'completed', 'retired'], default: 'active' },
  confirmed: { type: Boolean, default: true },
  targetDate: Date,
  source: { type: String, default: 'user', maxlength: 120 },
}, { _id: true });
const lifeContextSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    schemaVersion: { type: Number, default: 1 },
    revision: { type: Number, default: 0 },
    patternEvidenceRevision: { type: Number, default: 0 },
    lastPatternEvaluationAt: Date,
    writeSequence: { type: Number, default: 0 },
    legacySuppressedAt: { type: Date, default: null },
    preferredName: { type: String, default: '', maxlength: 200 },
    lifeStage: { type: String, default: '', maxlength: 500 },
    mentorStyle: { type: String, default: 'gentle', maxlength: 120 },
    narrative: { type: String, default: '', maxlength: 6000 },
    supportAreas: { type: [String], default: [] },
    values: { type: [String], default: [] },
    goals: { type: [goalSchema], default: [] },
    constraints: { type: [sourcedText], default: [] },
    resources: { type: [sourcedText], default: [] },
    obligations: { type: [sourcedText], default: [] },
    relationships: { type: [sourcedText], default: [] },
    legacyIntake: { type: mongoose.Schema.Types.Mixed, default: {} },
    primary_focus: {
      type: String,
      enum: ['health', 'relationships', 'purpose', 'career', 'emotional', 'spiritual'],
    },
    stress_level: { type: Number, min: 0, max: 10 },
    current_challenges: [{ type: String, trim: true }],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

lifeContextSchema.plugin(require('./coreOwned'), {"ownerKey":"user_id","references":{},evidenceSource:true});

module.exports = mongoose.model('LifeContext', lifeContextSchema);
