const mongoose = require('mongoose');

const protocolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    purpose: { type: String, trim: true },
    trigger_signals: [{ type: String, trim: true }],
    actions: [{ type: String, trim: true }],
    escalation_rules: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('Protocol', protocolSchema);
