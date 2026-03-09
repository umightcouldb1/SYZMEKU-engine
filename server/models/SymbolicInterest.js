const mongoose = require('mongoose');

const symbolicInterestSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    astrology: { type: Boolean, default: false },
    numerology: { type: Boolean, default: false },
    color_psychology: { type: Boolean, default: false },
    sacred_geometry: { type: Boolean, default: false },
    sound_therapy: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('SymbolicInterest', symbolicInterestSchema);
