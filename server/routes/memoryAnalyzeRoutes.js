const router = require('express').Router();
const Memory = require('../models/Memory');
const { protect } = require('../middleware/authMiddleware');
const { requestModelJson } = require('../services/modelRouter');
const { getOrCreateLineageMemory } = require('../services/lineageMemoryService');

const REQUIRED_KEYS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];

const stripJsonFence = (text = '') =>
  String(text)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

const normalizeArray = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

const parseModelAnalysis = (modelText = '') => {
  try {
    const parsed = JSON.parse(stripJsonFence(modelText));
    return REQUIRED_KEYS.reduce((acc, key) => {
      acc[key] = normalizeArray(parsed?.[key]);
      return acc;
    }, {});
  } catch (_error) {
    return {
      objectives: ['Keep the current request grounded in the active lineage context.'],
      constraints: ['The model returned text that could not be parsed as JSON.'],
      risks: [],
      leverage: [String(modelText || '').slice(0, 500)].filter(Boolean),
      next_actions: ['Ask one clearer follow-up question or simplify the prompt.'],
    };
  }
};

const toConversationLines = (history = []) =>
  history
    .slice(-12)
    .map((turn, index) => `${index + 1}. ${turn.role}: ${String(turn.text || '').slice(0, 700)}`)
    .join('\n');

const buildLineagePrompt = ({ text, context = {}, sovereignContext = {}, history = [] }) => `
[SYSTEM ARCHITECTURE DIRECTIVE: BIG SYZ LINEAGE MEMORY]
You are Big SYZ, an emotionally intelligent mentor and strategic operating system.
The user's onboarding blueprint must govern every response across the entire app.
Treat emotions as signal context, not commands. Do not diagnose, do not imitate therapy, and do not make unsafe promises.
Return ONLY valid JSON with this exact shape:
{"objectives":[],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}
Each field must be an array of concise strings.

Sovereign Matrix Note:
${sovereignContext.sovereignMatrixNote || context.sovereignMatrixNote || '(none saved)'}

Onboarding Reflection:
${sovereignContext.onboardingReflection || context.onboardingReflection || '(none saved)'}

Life Stage Choices:
${Array.isArray(sovereignContext.lifeStageChoices) && sovereignContext.lifeStageChoices.length ? sovereignContext.lifeStageChoices.join(', ') : context.lifeStage || '(none saved)'}

Current User Request:
${text}

Recent Persistent Conversation History:
${toConversationLines(history) || '(no prior turns saved)'}

Additional Dashboard Context:
${JSON.stringify({
  preferredName: context.preferredName || '',
  lifeStage: context.lifeStage || '',
  supportAreas: context.supportAreas || [],
  goals: context.goals || [],
  recentCommands: context.recentCommands || [],
}).slice(0, 3000)}
`.trim();

const getModelText = (modelResult = {}) =>
  modelResult?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

router.post('/', protect, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Command text is required.' });

  try {
    const userId = req.user.id || req.user._id;
    const rawContext = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const { memory, sovereignContext } = await getOrCreateLineageMemory(userId);
    const prompt = buildLineagePrompt({
      text,
      context: rawContext,
      sovereignContext,
      history: memory.conversationHistory || [],
    });

    const modelResult = await requestModelJson({ mode: 'mentor', prompt });

    if (modelResult?.providerError) {
      return res.status(502).json({
        message: 'Gemini request failed.',
        details: modelResult.providerError.message,
        model: modelResult.providerError.model,
      });
    }

    if (modelResult?.error) return res.json(modelResult.error);

    const rawModelText = getModelText(modelResult);
    const parsed = parseModelAnalysis(rawModelText);
    const modelSummary = parsed.objectives[0] || parsed.next_actions[0] || rawModelText || 'Big SYZ reviewed the request through the active lineage context.';
    const now = new Date();
    const turns = [
      { role: 'user', text, timestamp: now },
      { role: 'model', text: modelSummary, timestamp: now },
    ];

    const updatedMemory = await Memory.findOneAndUpdate(
      { userId },
      {
        $set: { sovereignContext },
        $push: {
          conversationHistory: {
            $each: turns,
            $slice: -80,
          },
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      ...parsed,
      text: modelSummary,
      summary: modelSummary,
      reasoning_summary: modelSummary,
      lineage_status: 'Lineage Sync Established',
      memory_turns: updatedMemory?.conversationHistory?.length || 0,
      conversationHistory: updatedMemory?.conversationHistory || [],
      sovereignContext: updatedMemory?.sovereignContext || sovereignContext,
      sovereign_context: updatedMemory?.sovereignContext || sovereignContext,
      model: modelResult.model,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Lineage memory analysis failed.',
      details: String(error?.message || error).slice(0, 500),
    });
  }
});

module.exports = router;
