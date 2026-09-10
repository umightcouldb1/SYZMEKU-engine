const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  schemaVersion: {
    type: String,
    default: 'reasoning-v1'
  },
  revision: {
    type: Number,
    default: 1
  },
  purpose: {
    type: String,
    enum: require('../contracts/reasoningContracts').PURPOSES,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'archived'],
    default: 'draft'
  },
  freshness: {
    type: String,
    enum: ['current', 'stale', 'redacted'],
    default: 'current'
  },
  requestKey: {
    type: String,
    required: true,
    maxlength: 100
  },
  requestHash: {
    type: String,
    required: true
  },
  requestSummary: {
    type: String,
    maxlength: 1000
  },
  selectedGoalIds: [mongoose.Schema.Types.ObjectId],
  inputDigest: String,
  validationDigest: String,
  sourceManifest: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  provider: {
    type: String,
    enum: ['gemini', 'ollama']
  },
  model: {
    type: String,
    maxlength: 200
  },
  policyVersion: {
    type: String,
    default: 'reasoning-policy-v1'
  },
  invalidation: {
    at: Date,
    reasonCode: String
  }
}, {
  timestamps: true
});
schema.path('payload').validate(v => !v || Buffer.byteLength(JSON.stringify(v)) <= 65536, 'Saved reasoning exceeds size limit.');
schema.plugin(require('./coreOwned'), {
  ownerKey: 'userId'
});
schema.index({
  userId: 1,
  requestKey: 1
}, {
  unique: true,
  name: 'reasoning_owner_request_uq'
});
schema.index({
  userId: 1,
  updatedAt: -1,
  _id: 1
}, {
  name: 'reasoning_owner_updated'
});
module.exports = mongoose.model('ReasoningRecord', schema);
