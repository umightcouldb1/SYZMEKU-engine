const mongoose = require('mongoose');

const sensoryProfileSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    preferred_environment: {
      type: String,
      enum: ['silence', 'nature', 'music', 'rhythm', 'white_noise'],
    },
    light_sensitivity: { type: Number, min: 0, max: 10 },
    sound_sensitivity: { type: Number, min: 0, max: 10 },
    crowd_sensitivity: { type: Number, min: 0, max: 10 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('SensoryProfile', sensoryProfileSchema);
