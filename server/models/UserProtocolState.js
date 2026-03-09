const mongoose = require('mongoose');

const userProtocolStateSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    protocol_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Protocol', required: true },
    status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
    started_at: { type: Date, default: Date.now },
    last_run: Date,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

userProtocolStateSchema.index({ user_id: 1, protocol_id: 1 }, { unique: true });

module.exports = mongoose.model('UserProtocolState', userProtocolStateSchema);
