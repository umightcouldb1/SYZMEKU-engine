const router = require('express').Router();
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

router.post('/', protect, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Command text is required.' });

  const rawContext = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
  const { memory, sovereignContext } = await getOrCreateLineageMemory(req.user._id);
  const prompt = buildLineagePrompt({
    text,
    context: rawContext,
    sovereignContext,
    history: memory.conversationHistory || [],
  });

  try {
    const modelResult = await requestModelJson({ mode: 'mentor', prompt });

    if (modelResult?.providerError) {
      return res.status(502).json({
        message: 'Gemini request failed.',
        details: modelResult.providerError.message,
        model: modelResult.providerError.model,
      });
    }

    if (modelResult?.error) return res.json(modelResult.error);

    const modelText = modelResult?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseModelAnalysis(modelText);
    const modelSummary = parsed.objectives[0] || parsed.next_actions[0] || 'Big SYZ reviewed the request through the active lineage context.';
    const responsePayload = {
      ...parsed,
      summary: modelSummary,
      reasoning_summary: modelSummary,
      lineage_status: 'Lineage Sync Established',
      memory_turns: (memory.conversationHistory || []).length + 2,
      sovereign_context: sovereignContext,
      model: modelResult.model,
    };

    memory.appendConversationTurns([
      { role: 'user', text },
      { role: 'model', text: modelSummary },
    ]);
    await memory.save();

    return res.json(responsePayload);
  } catch (error) {
    return res.status(502).json({
      message: 'Gemini request failed.',
      details: String(error?.message || error).slice(0, 500),
    });
  }
});

module.exports = router;
