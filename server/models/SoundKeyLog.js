const mongoose = require('mongoose');

const soundKeyLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    frequency: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    activationKey: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('SoundKeyLog', soundKeyLogSchema);
