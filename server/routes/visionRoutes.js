const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { requestModelText } = require('../services/modelRouter');

const MAX_MEDIA_BASE64_CHARS = 8_000_000;
const SUPPORTED_MEDIA_PREFIXES = ['image/', 'video/'];

const cleanMediaAttachment = (media = {}) => {
  const mimeType = String(media.mimeType || '').trim().toLowerCase();
  const data = String(media.data || '').replace(/^data:[^;]+;base64,/, '').trim();
  const name = String(media.name || 'attached media').trim().slice(0, 120);

  if (!mimeType || !SUPPORTED_MEDIA_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return { error: 'Attach an image or video file.' };
  }

  if (!data) return { error: 'Attached media data is empty.' };
  if (data.length > MAX_MEDIA_BASE64_CHARS) {
    return { error: 'Attached media is too large for this preview pipeline.' };
  }

  return { mimeType, data, name };
};

const buildVisionPrompt = ({ text, media, context = {} }) => `
[SYSTEM ARCHITECTURE DIRECTIVE: BIG SYZ VISION NODE]
You are Big SYZ reading a visual attachment for a logged-in user.
Use the attached ${media.mimeType.startsWith('video/') ? 'video' : 'image'} as real context, not decoration.
Respond with emotionally intelligent, practical guidance. Do not diagnose, identify private people, or make unsafe promises.
If the attachment is unclear, say what can and cannot be inferred.

User prompt: "${text || 'Analyze this attachment and tell me what matters.'}"
Sovereign Matrix Note: ${context.sovereignMatrixNote || '(none provided)'}
Recent conversation turns: ${Array.isArray(context.recentCommands) ? context.recentCommands.slice(-8).join(' | ') : '(none provided)'}
Attachment name: ${media.name}

Return a concise mentor response in 2-4 sentences, followed by one grounded next action.
`.trim();

router.post('/analyze', protect, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
  const media = cleanMediaAttachment(req.body?.media || req.body?.attachment || context?.mediaAttachment);

  if (media.error) {
    return res.status(400).json({ message: media.error });
  }

  const prompt = buildVisionPrompt({ text, media, context });

  try {
    const result = await requestModelText({
      mode: 'vision',
      prompt,
      parts: [{ mimeType: media.mimeType, data: media.data }],
    });

    if (result?.providerError) {
      return res.status(502).json({
        message: 'Vision model provider error.',
        details: result.providerError.message,
        model: result.providerError.model,
      });
    }

    if (result?.error) return res.json(result.error);

    const summary = String(result?.text || '').trim() || 'I received the attachment, but the vision model did not return a readable response.';

    return res.json({
      summary,
      reasoning_summary: summary,
      objectives: ['Interpret the uploaded visual context.'],
      constraints: ['Visual analysis is supportive and non-diagnostic.'],
      risks: [],
      leverage: [`Attachment processed: ${media.name}`],
      next_actions: ['Use the visual insight to choose one grounded next step.'],
      visual_context: {
        name: media.name,
        mimeType: media.mimeType,
        model: result.model,
      },
    });
  } catch (error) {
    return res.status(502).json({
      message: 'Vision request failed.',
      details: String(error?.message || error).slice(0, 500),
    });
  }
});

module.exports = router;
