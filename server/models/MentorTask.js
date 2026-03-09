const mongoose = require('mongoose');

const mentorTaskSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    protocol_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Protocol' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'complete'], default: 'pending' },
    completed_at: Date,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('MentorTask', mentorTaskSchema);
