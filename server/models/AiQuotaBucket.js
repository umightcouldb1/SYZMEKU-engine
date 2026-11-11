const mongoose = require('mongoose');
// _id's built-in unique index is the atomic admission boundary. No optional
// secondary index, TTL job, in-process cache or restart reset is needed.
const schema = new mongoose.Schema({
  _id: { type: String },
  attempts: { type: Number, required: true },
}, { versionKey: false, autoIndex: false });
module.exports = mongoose.model('AiQuotaBucket', schema);
