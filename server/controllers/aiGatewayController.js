const asyncHandler = require('express-async-handler');
const axios = require('axios');
const { logAuditEvent } = require('../utils/audit');

const MASTER_ROLE = 'COMMANDER_IN_CHIEF';
const USER_ROLE = 'USER';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.MODEL_TARGET || 'gemini-2.5-flash';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
let genAiClientPromise;

const sanitizePrompt = (value) => String(value || '').trim();

const getPromptFromRequest = (req) => sanitizePrompt(req.body?.prompt || req.body?.message || req.body?.input);

const getErrorStatus = (error) => error?.statusCode || error?.status || error?.response?.status || 503;

const getSafeGatewayError = (error) => ({
  message: error?.message || 'Upstream provider request failed.',
  code: error?.code || error?.cause?.code || '',
  status: getErrorStatus(error),
});

const getGeminiApiKey = () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return process.env.GEMINI_API_KEY;
};

const getGeminiClient = async () => {
  const apiKey = getGeminiApiKey();

  if (!genAiClientPromise) {
    genAiClientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }

  return genAiClientPromise;
};

const extractGeminiText = (response) => {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  return JSON.stringify(response);
};

const processWithGemini = async (prompt) => {
  const ai = await getGeminiClient();
  const response = await ai.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: prompt,
  });

  return {
    provider: 'gemini',
    model: DEFAULT_GEMINI_MODEL,
    response: extractGeminiText(response),
  };
};

const processWithOllama = async (prompt) => {
  const baseUrl = DEFAULT_OLLAMA_BASE_URL.replace(/\/+$/, '');
  const { data } = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model: DEFAULT_OLLAMA_MODEL,
      prompt,
      stream: false,
    },
    {
      timeout: OLLAMA_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    },
  );

  return {
    provider: 'ollama',
    model: data?.model || DEFAULT_OLLAMA_MODEL,
    response: data?.response || '',
  };
};

const auditGatewayEvent = async ({ req, provider, success, details = {} }) => {
  await logAuditEvent({
    category: 'ai_gateway',
    event: 'hybrid_llm_prompt_processed',
    req,
    userId: req.user?._id || null,
    role: req.user?.role || USER_ROLE,
    success,
    details: { provider, ...details },
  }).catch(() => {});
};

const processIntelligencePrompt = asyncHandler(async (req, res) => {
  const prompt = getPromptFromRequest(req);
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required.' });
  }

  const role = req.user?.role || USER_ROLE;
  const isCommander = role === MASTER_ROLE;

  try {
    const result = isCommander
      ? await processWithOllama(prompt)
      : await processWithGemini(prompt);

    await auditGatewayEvent({
      req,
      provider: result.provider,
      success: true,
      details: { model: result.model, rolePath: isCommander ? 'local_commander' : 'cloud_user' },
    });

    return res.status(200).json({
      success: true,
      rolePath: isCommander ? 'local_commander' : 'cloud_user',
      ...result,
    });
  } catch (error) {
    const provider = isCommander ? 'ollama' : 'gemini';
    const diagnostics = getSafeGatewayError(error);
    console.error(`[AI_GATEWAY_ERR] ${provider}: ${JSON.stringify(diagnostics)}`);

    await auditGatewayEvent({
      req,
      provider,
      success: false,
      details: diagnostics,
    });

    const message = isCommander
      ? 'Local commander model is unavailable. Start Ollama locally or configure OLLAMA_BASE_URL to a private reachable endpoint.'
      : 'Cloud intelligence model is unavailable.';

    const payload = {
      success: false,
      provider,
      message,
    };

    if (process.env.AI_GATEWAY_DIAGNOSTICS === 'true') {
      payload.diagnostics = diagnostics;
    }

    return res.status(diagnostics.status).json(payload);
  }
});

module.exports = {
  MASTER_ROLE,
  processIntelligencePrompt,
};
