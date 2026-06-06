const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemini-2.5-flash';

const MODEL_ALIASES = {
  mentor_model: process.env.MENTOR_MODEL || DEFAULT_MODEL,
  strategic_model: process.env.STRATEGIC_MODEL || DEFAULT_MODEL,
  signal_model: process.env.SIGNAL_MODEL || DEFAULT_MODEL,
  safety_model: process.env.SAFETY_MODEL || DEFAULT_MODEL,
  code_model: process.env.CODE_MODEL || DEFAULT_MODEL,
};

const getGeminiApiKey = () => process.env.GEMINI_API_KEY || process.env.Gemini_API_Key || process.env.Gemini_API_KEY || '';

const resolveModelAlias = (mode = 'strategic') => {
  if (['mentor', 'reflect', 'reframe'].includes(mode)) return MODEL_ALIASES.mentor_model;
  if (['strategic', 'plan', 'build', 'analyze'].includes(mode)) return MODEL_ALIASES.strategic_model;
  if (['signal', 'trend', 'pattern', 'recommend'].includes(mode)) return MODEL_ALIASES.signal_model;
  if (['sentinel', 'safety'].includes(mode)) return MODEL_ALIASES.safety_model;
  if (['code', 'system'].includes(mode)) return MODEL_ALIASES.code_model;
  return MODEL_ALIASES.strategic_model;
};

const requestModelJson = async ({ mode, prompt }) => {
  const modelName = resolveModelAlias(mode);
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      error: {
        objectives: ['Model provider key is missing on the server.'],
        constraints: [],
        risks: ['GEMINI_API_KEY is not configured.'],
        leverage: ['Set GEMINI_API_KEY and optional *_MODEL aliases.'],
        next_actions: ['Configure environment and retry.'],
      },
    };
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      providerError: {
        status: response.status,
        message: String(errorText || '').slice(0, 300),
        model: modelName,
      },
    };
  }

  const data = await response.json();
  return { data, model: modelName };
};

const extractModelText = (modelResult = {}) =>
  modelResult?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

const requestModelText = async ({ mode = 'mentor', prompt }) => {
  const modelResult = await requestModelJson({ mode, prompt });
  if (modelResult?.error || modelResult?.providerError) return modelResult;

  return {
    text: extractModelText(modelResult),
    model: modelResult.model,
  };
};

const getModelRoutingConfig = () => ({ ...MODEL_ALIASES });

module.exports = { requestModelJson, requestModelText, resolveModelAlias, getModelRoutingConfig };
