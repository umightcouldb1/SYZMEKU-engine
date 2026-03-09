const mongoose = require('mongoose');

const mentorSignalSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    signal_type: {
      type: String,
      required: true,
      enum: ['stress', 'sleep', 'emotion', 'focus', 'symptom', 'environment'],
      index: true,
    },
    value: { type: Number, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    recorded_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('MentorSignal', mentorSignalSchema);
