const mongoose = require('mongoose');

const emotionalPatternSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    stress_response: {
      type: String,
      enum: ['withdraw', 'overthink', 'confront', 'shutdown', 'seek_support'],
    },
    recovery_method: {
      type: String,
      enum: ['solitude', 'conversation', 'movement', 'creativity', 'nature', 'music'],
    },
    triggers: [{ type: String, trim: true }],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('EmotionalPattern', emotionalPatternSchema);
