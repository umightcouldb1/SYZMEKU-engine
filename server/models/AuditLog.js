const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['auth', 'access', 'core-action'],
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    role: {
      type: String,
      default: '',
    },
    success: {
      type: Boolean,
      default: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
