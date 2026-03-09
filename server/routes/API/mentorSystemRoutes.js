const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { protect } = require('../../middleware/authMiddleware');
const MentorProfile = require('../../models/MentorProfile');
const LifeContext = require('../../models/LifeContext');
const BehavioralRhythm = require('../../models/BehavioralRhythm');
const EmotionalPattern = require('../../models/EmotionalPattern');
const ColorProfile = require('../../models/ColorProfile');
const SensoryProfile = require('../../models/SensoryProfile');
const SymbolicInterest = require('../../models/SymbolicInterest');
const MentorSignal = require('../../models/MentorSignal');
const Protocol = require('../../models/Protocol');
const UserProtocolState = require('../../models/UserProtocolState');
const MentorTask = require('../../models/MentorTask');
const MentorMessage = require('../../models/MentorMessage');
const LoopStatus = require('../../models/LoopStatus');

const router = express.Router();

const upsertByUser = (Model, userId, payload = {}) =>
  Model.findOneAndUpdate(
    { user_id: userId },
    { $set: payload, $setOnInsert: { user_id: userId } },
    { upsert: true, new: true, runValidators: true },
  );

router.post(
  '/intake',
  protect,
  expressAsyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      profile,
      life_context: lifeContext,
      behavioral_rhythm: behavioralRhythm,
      emotional_patterns: emotionalPatterns,
      color_profile: colorProfile,
      sensory_profile: sensoryProfile,
      symbolic_interests: symbolicInterests,
    } = req.body;

    const [profileDoc, lifeContextDoc, behavioralRhythmDoc, emotionalPatternsDoc, colorProfileDoc, sensoryProfileDoc, symbolicInterestsDoc] = await Promise.all([
      profile ? upsertByUser(MentorProfile, userId, profile) : null,
      lifeContext ? upsertByUser(LifeContext, userId, lifeContext) : null,
      behavioralRhythm ? upsertByUser(BehavioralRhythm, userId, behavioralRhythm) : null,
      emotionalPatterns ? upsertByUser(EmotionalPattern, userId, emotionalPatterns) : null,
      colorProfile ? upsertByUser(ColorProfile, userId, colorProfile) : null,
      sensoryProfile ? upsertByUser(SensoryProfile, userId, sensoryProfile) : null,
      symbolicInterests ? upsertByUser(SymbolicInterest, userId, symbolicInterests) : null,
    ]);

    res.status(200).json({
      status: 'MENTOR_INTAKE_SAVED',
      data: {
        profile: profileDoc,
        life_context: lifeContextDoc,
        behavioral_rhythm: behavioralRhythmDoc,
        emotional_patterns: emotionalPatternsDoc,
        color_profile: colorProfileDoc,
        sensory_profile: sensoryProfileDoc,
        symbolic_interests: symbolicInterestsDoc,
      },
    });
  }),
);

router.get(
  '/intake',
  protect,
  expressAsyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [profile, life_context, behavioral_rhythm, emotional_patterns, color_profile, sensory_profile, symbolic_interests] = await Promise.all([
      MentorProfile.findOne({ user_id: userId }),
      LifeContext.findOne({ user_id: userId }),
      BehavioralRhythm.findOne({ user_id: userId }),
      EmotionalPattern.findOne({ user_id: userId }),
      ColorProfile.findOne({ user_id: userId }),
      SensoryProfile.findOne({ user_id: userId }),
      SymbolicInterest.findOne({ user_id: userId }),
    ]);

    res.json({
      profile,
      life_context,
      behavioral_rhythm,
      emotional_patterns,
      color_profile,
      sensory_profile,
      symbolic_interests,
    });
  }),
);

router.post(
  '/signals',
  protect,
  expressAsyncHandler(async (req, res) => {
    const signal = await MentorSignal.create({
      user_id: req.user.id,
      signal_type: req.body.signal_type,
      value: req.body.value,
      metadata: req.body.metadata || {},
      recorded_at: req.body.recorded_at,
    });

    res.status(201).json(signal);
  }),
);

router.get(
  '/signals',
  protect,
  expressAsyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 250);
    const query = { user_id: req.user.id };
    if (req.query.signal_type) query.signal_type = req.query.signal_type;

    const signals = await MentorSignal.find(query).sort({ recorded_at: -1 }).limit(limit);
    res.json(signals);
  }),
);

router.post(
  '/protocols',
  protect,
  expressAsyncHandler(async (req, res) => {
    const protocol = await Protocol.create(req.body);
    res.status(201).json(protocol);
  }),
);

router.get('/protocols', protect, expressAsyncHandler(async (_req, res) => {
  const protocols = await Protocol.find({}).sort({ created_at: -1 });
  res.json(protocols);
}));

router.post('/user-protocols', protect, expressAsyncHandler(async (req, res) => {
  const { protocol_id: protocolId, status, started_at: startedAt, last_run: lastRun } = req.body;
  const record = await UserProtocolState.findOneAndUpdate(
    { user_id: req.user.id, protocol_id: protocolId },
    { $set: { status, started_at: startedAt, last_run: lastRun } },
    { upsert: true, new: true, runValidators: true },
  );

  res.status(200).json(record);
}));

router.get('/user-protocols', protect, expressAsyncHandler(async (req, res) => {
  const records = await UserProtocolState.find({ user_id: req.user.id }).populate('protocol_id').sort({ updated_at: -1 });
  res.json(records);
}));

router.post('/tasks', protect, expressAsyncHandler(async (req, res) => {
  const task = await MentorTask.create({ ...req.body, user_id: req.user.id });
  res.status(201).json(task);
}));

router.get('/tasks', protect, expressAsyncHandler(async (req, res) => {
  const query = { user_id: req.user.id };
  if (req.query.status) query.status = req.query.status;
  const tasks = await MentorTask.find(query).sort({ created_at: -1 });
  res.json(tasks);
}));

router.post('/messages', protect, expressAsyncHandler(async (req, res) => {
  const message = await MentorMessage.create({ ...req.body, user_id: req.user.id });
  res.status(201).json(message);
}));

router.get('/messages', protect, expressAsyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const messages = await MentorMessage.find({ user_id: req.user.id }).sort({ created_at: -1 }).limit(limit);
  res.json(messages);
}));

router.post('/loop-status', protect, expressAsyncHandler(async (req, res) => {
  const { active, last_cycle: lastCycle, cycle_count: cycleCount } = req.body;
  const state = await LoopStatus.findOneAndUpdate(
    { user_id: req.user.id },
    { $set: { active, last_cycle: lastCycle, cycle_count: cycleCount } },
    { upsert: true, new: true, runValidators: true },
  );

  res.status(200).json(state);
}));

router.get('/loop-status', protect, expressAsyncHandler(async (req, res) => {
  const state = await LoopStatus.findOne({ user_id: req.user.id });
  res.json(state || { active: false, cycle_count: 0 });
}));

module.exports = router;
