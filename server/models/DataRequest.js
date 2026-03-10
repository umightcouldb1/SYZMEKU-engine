const mongoose = require('mongoose');

const dataRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestType: {
      type: String,
      enum: ['export', 'delete'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_review', 'completed', 'rejected'],
      default: 'pending',
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DataRequest', dataRequestSchema);
