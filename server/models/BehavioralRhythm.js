const mongoose = require('mongoose');

const behavioralRhythmSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    peak_energy_time: { type: String, enum: ['morning', 'midday', 'evening', 'night'] },
    sleep_pattern: { type: String, enum: ['early', 'irregular', 'night'] },
    decision_style: { type: String, enum: ['intuitive', 'analytical', 'balanced'] },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('BehavioralRhythm', behavioralRhythmSchema);
