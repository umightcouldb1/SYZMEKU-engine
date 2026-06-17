const mongoose = require('mongoose');

const realEstateDealSchema = new mongoose.Schema({
  daysOnMarket: {
    type: Number,
    required: true
  },
  subjectToInterestRate: {
    type: String,
    required: true
  },
  earnestMoneyGap: {
    type: Number,
    required: true
  },
  coLivingRoomCount: {
    type: Number,
    required: true
  },
  projectedMonthlyYield: {
    type: Number,
    required: true
  }
});

const RealEstateDeal = mongoose.model('RealEstateDeal', realEstateDealSchema);

module.exports = RealEstateDeal;