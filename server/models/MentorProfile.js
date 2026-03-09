const mongoose = require('mongoose');

const mentorProfileSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    preferred_name: { type: String, trim: true },
    birth_name: { type: String, trim: true },
    birth_date: Date,
    birth_time: { type: String, trim: true },
    birth_city: { type: String, trim: true },
    birth_country: { type: String, trim: true },
    symbolic_preference: {
      type: String,
      enum: ['none', 'light', 'balanced', 'heavy'],
      default: 'balanced',
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('MentorProfile', mentorProfileSchema);
