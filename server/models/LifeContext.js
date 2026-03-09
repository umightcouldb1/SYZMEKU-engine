const mongoose = require('mongoose');

const lifeContextSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    primary_focus: {
      type: String,
      enum: ['health', 'relationships', 'purpose', 'career', 'emotional', 'spiritual'],
    },
    stress_level: { type: Number, min: 0, max: 10 },
    current_challenges: [{ type: String, trim: true }],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('LifeContext', lifeContextSchema);
