const mongoose = require('mongoose');

const mentorMessageSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message_type: { type: String, enum: ['mentor', 'reflection', 'insight'], required: true },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

mentorMessageSchema.plugin(require('./coreOwned'), {"ownerKey":"user_id","references":{}});

module.exports = mongoose.model('MentorMessage', mentorMessageSchema);
