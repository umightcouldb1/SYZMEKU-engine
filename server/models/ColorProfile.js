const mongoose = require('mongoose');

const colorProfileSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    favorite_color: { type: String, trim: true },
    most_worn_color: { type: String, trim: true },
    power_color: { type: String, trim: true },
    calming_color: { type: String, trim: true },
    avoided_color: { type: String, trim: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

module.exports = mongoose.model('ColorProfile', colorProfileSchema);
