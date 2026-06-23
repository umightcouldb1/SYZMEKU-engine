const router = require('express').Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');

const MODULES = [
  {
    id: 'electroculture',
    name: 'Electroculture Field Planner',
    category: 'Regenerative Systems',
    description: 'Translate bed size, soil state, and crop intention into a field-ready electroculture planning brief.',
    requiredFields: ['crop', 'bedLengthFt', 'bedWidthFt', 'soilMoisture', 'intent'],
  },
  {
    id: 'closed-loop-agriculture',
    name: 'Closed-Loop Agriculture System',
    category: 'Agriculture Operations',
    description: 'Map inputs, outputs, water cycle, compost stream, and daily action priorities into a closed-loop protocol.',
    requiredFields: ['crop', 'waterSource', 'wasteStream', 'growthStage', 'constraint'],
  },
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildElectroculturePlan = (payload) => {
  const bedLengthFt = Math.max(toNumber(payload.bedLengthFt), 1);
  const bedWidthFt = Math.max(toNumber(payload.bedWidthFt), 1);
  const bedArea = Math.round(bedLengthFt * bedWidthFt);
  const antennaCount = Math.max(1, Math.ceil(bedArea / 64));
  const spacingFt = Math.max(4, Math.round(Math.sqrt(bedArea / antennaCount)));

  return {
    title: 'Electroculture Field Brief',
    summary: `${payload.crop || 'The crop system'} can start with ${antennaCount} copper antenna node${antennaCount === 1 ? '' : 's'} across roughly ${bedArea} sq ft.`,
    metrics: {
      bedAreaSqFt: bedArea,
      suggestedAntennaNodes: antennaCount,
      suggestedSpacingFt: spacingFt,
      soilMoisture: payload.soilMoisture || 'not provided',
    },
    nextActions: [
      `Place the first antenna at the bed's windward edge and keep spacing near ${spacingFt} ft.`,
      `Log soil moisture before and after irrigation for 3 days to establish a baseline.`,
      `Watch ${payload.crop || 'the crop'} leaf posture, germination speed, and pest pressure before scaling.`,
    ],
    caution: 'Use passive antenna planning only. Do not connect live electrical current to soil, plants, or irrigation hardware.',
  };
};

const buildClosedLoopPlan = (payload) => {
  const growthStage = payload.growthStage || 'active growth';
  const waterSource = payload.waterSource || 'available water';
  const wasteStream = payload.wasteStream || 'organic residue';

  return {
    title: 'Closed-Loop Agriculture Protocol',
    summary: `${payload.crop || 'This system'} is mapped for ${growthStage} using ${waterSource} and cycling ${wasteStream} back into the operation.`,
    metrics: {
      waterLoop: waterSource,
      organicInput: wasteStream,
      growthStage,
      primaryConstraint: payload.constraint || 'none provided',
    },
    nextActions: [
      `Separate clean water, greywater, and runoff paths before adding automation.`,
      `Convert ${wasteStream} into a tracked compost or mulch input instead of treating it as disposal.`,
      `Set one daily observation: water level, pest pressure, nutrient color, or temperature drift.`,
    ],
    caution: 'Keep food-safety rules, local water regulations, and pathogen controls above convenience when closing loops.',
  };
};

router.get('/', protect, (_req, res) => {
  res.status(200).json({
    status: 'ACTIVE',
    modules: MODULES,
  });
});

router.post('/analyze', protect, asyncHandler(async (req, res) => {
  const { moduleId, payload = {} } = req.body || {};
  const module = MODULES.find((entry) => entry.id === moduleId);

  if (!module) {
    return res.status(404).json({ message: 'Module not found.' });
  }

  const analysis = moduleId === 'electroculture'
    ? buildElectroculturePlan(payload)
    : buildClosedLoopPlan(payload);

  return res.status(200).json({
    module,
    analysis,
    generatedAt: new Date().toISOString(),
    operator: req.user?.email || req.user?.username || 'authenticated-user',
  });
}));

module.exports = router;
