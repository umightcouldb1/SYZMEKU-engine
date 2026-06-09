const mongoose = require('mongoose');

const LineageMilestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    targetDate: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      enum: ['ESTATE_LEGAL', 'GEOGRAPHIC_SHIFT', 'SOLAR_RETURN', 'SYSTEM_UPGRADE'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'ANCHORED'],
      default: 'PENDING',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    executionSteps: {
      type: [String],
      default: [],
    },
    isCriticalThreshold: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

LineageMilestoneSchema.index({ targetDate: 1, category: 1 });
LineageMilestoneSchema.index({ status: 1, isCriticalThreshold: 1 });

module.exports = mongoose.model('LineageMilestone', LineageMilestoneSchema);
