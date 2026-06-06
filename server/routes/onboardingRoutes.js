const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
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
  return `Big SYZ is reading ${joinedChoices} as the active pattern field.${concern} We will keep the next guidance supportive, direct, and focused on one grounded move at a time.`;
};

router.post('/', protect, async (req, res) => {
  const choices = cleanList(req.body?.choices || req.body?.lifeStages || req.body?.lifeStage || req.body?.supportAreas);
  const typedText = String(req.body?.typedText || req.body?.primaryConcern || req.body?.concern || '').trim();

  if (!choices.length && !typedText) {
    return res.status(400).json({
      success: false,
      customAnswer: fallbackReflection({ choices, typedText }),
      message: 'At least one selected choice or typed concern is required.',
    });
  }

  const prompt = [
    'You are Big SYZ, an emotionally intelligent mentor platform.',
    'Write a custom 2-sentence onboarding profile summary for the dashboard.',
    'Make it supportive, clear, direct, non-clinical, and specific to the user input.',
    `The user selected these multiple options: ${choices.join(', ') || '(none selected)'}.`,
    `They also wrote this specific concern: "${typedText || '(none provided)'}".`,
    'Return only the 2-sentence summary. Do not include labels, markdown, diagnosis, or medical claims.',
  ].join('\n');

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

module.exports = router;
