const mongoose = require('mongoose');

const GovernmentContractSchema = new mongoose.Schema({
  solicitationNumber: {
    type: String,
    required: true
  },
  agencyName: {
    type: String,
    required: true
  },
  naicsCode: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  setAsideType: {
    type: String,
    default: '8a'
  },
  contractType: {
    type: String,
    default: 'Task Order'
  },
  estimatedValue: {
    type: Number,
    required: true
  },
  fiscalSurgeUrgency: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('GovernmentContract', GovernmentContractSchema);