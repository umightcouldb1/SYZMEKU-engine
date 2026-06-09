const mongoose = require('mongoose');

const SovereignAssetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['REAL_ESTATE', 'EQUIPMENT', 'BOTANICAL', 'LOGISTICS'],
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator(value) {
            return Array.isArray(value)
              && value.length === 2
              && value.every((coordinate) => Number.isFinite(coordinate));
          },
          message: 'Coordinates must be [longitude, latitude].',
        },
      },
      address: {
        type: String,
        trim: true,
        default: '',
      },
      county: {
        type: String,
        trim: true,
        default: 'Greene',
      },
    },
    status: {
      type: String,
      enum: ['CONCEPTUAL', 'ACQUISITION', 'ACTIVE', 'ARCHIVED'],
      default: 'CONCEPTUAL',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

SovereignAssetSchema.index({ location: '2dsphere' });
SovereignAssetSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('SovereignAsset', SovereignAssetSchema);
