const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { requestModelText } = require('../services/modelRouter');

const cleanList = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const fallbackReflection = ({ choices = [], typedText = '' }) => {
  const joinedChoices = choices.length ? choices.join(', ') : 'your current season';
  const concern = typedText ? ` You named this concern clearly: ${typedText}` : '';
  return `Thank you for sharing about ${joinedChoices}.${concern} We will keep the next guidance supportive, direct, and focused on one grounded move at a time.`;
};

router.post('/', protect, async (req, res) => {
  const choices = cleanList(req.body?.choices || req.body?.lifeStages || req.body?.lifeStage || req.body?.supportAreas);
  const typedText = String(req.body?.typedText || req.body?.primaryConcern || req.body?.concern || '').trim();

  if (require('../services/reasoningCapabilityService').enabled()) {
    // Onboarding is a transient reflection of explicit choices, not evidence or
    // a goal-selection decision. Canonical saving remains /profile-context.
    res.set('Cache-Control', 'private, no-store');
    if (choices.length > 20 || choices.some(c => c.length > 200) || typedText.length > 2000 || (!choices.length && !typedText)) {
      const failure=require('../services/reasoningService').failure(require('../services/reasoningCapabilityService').error('INVALID_REQUEST','Supply bounded reflection inputs.'));
      return res.status(failure.status).json(failure.body);
    }
    try {
      require('../services/coreScopeService').rejectOwnerFields(req.body);
      await require('../services/reasoningCapabilityService').recheck();
      return res.json({ success: true, kind: 'user-input-reflection', customAnswer: 'You chose '+(choices.join(', ') || 'to describe your current situation')+'. '+(typedText ? 'Your stated concern: '+typedText : 'You can set an explicit goal when you are ready.'), patternContext: { patterns: [], unavailableReasons: ['REFLECTION_IS_NOT_PATTERN_EVIDENCE'] }, persisted: false });
    } catch (error) { const failure = require('../services/reasoningService').failure(error); return res.status(failure.status).json(failure.body); }
  }

  if (!choices.length && !typedText) {
    return res.status(400).json({
      success: false,
      customAnswer: fallbackReflection({ choices, typedText }),
      message: 'At least one selected choice or typed concern is required.',
    });
  }

  const prompt = require('../services/mentorVoice') + `
Reflect in two natural sentences on what the person shared. Avoid technical metaphors and assumptions.
Life situations: ${choices.join(', ')}
Current concern: ${typedText}`;

  try {
    const result = await requestModelText({ mode: 'mentor', prompt });
    const customAnswer = String(result?.text || '').trim();

    if (!customAnswer) {
      return res.json({
        success: false,
        customAnswer: fallbackReflection({ choices, typedText }),
        providerStatus: result?.providerError?.status || null,
      });
    }

    return res.json({
      success: true,
      customAnswer,
      model: result.model,
    });
  } catch (error) {
    console.warn('[onboarding] Gemini reflection fallback:', error?.message || error);
    return res.json({
      success: false,
      customAnswer: fallbackReflection({ choices, typedText }),
    });
  }
});

router.post('/profile-context', protect, async (req,res,next) => {
  try { const onboarding=await require('../services/coreContextService').saveOnboarding(req.body);res.json({success:true,onboarding}); } catch(error){next(error);}
});

module.exports = router;
