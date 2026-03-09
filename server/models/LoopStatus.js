const mongoose = require('mongoose');

const loopStatusSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    active: { type: Boolean, default: false },
    last_cycle: Date,
    cycle_count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('LoopStatus', loopStatusSchema);
