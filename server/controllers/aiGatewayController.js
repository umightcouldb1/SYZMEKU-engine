const asyncHandler = require('express-async-handler');
const axios = require('axios');
const { logAuditEvent } = require('../utils/audit');

const MASTER_ROLE = 'COMMANDER_IN_CHIEF';
const USER_ROLE = 'USER';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.MODEL_TARGET || 'gemini-2.5-flash';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 45000);

let geminiClientPromise;

const sanitizePrompt = (value) => String(value || '').trim();

const getPromptFromRequest = (req) => sanitizePrompt(req.body?.prompt || req.body?.message || req.body?.input);

const getGeminiClient = async () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!geminiClientPromise) {
    geminiClientPromise = import('@google/genai').then(({ GoogleGenAI }) => {
      return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    });
  }

  return geminiClientPromise;
};

const extractGeminiText = (response) => {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  return JSON.stringify(response);
};

const processWithGemini = async (prompt) => {
  const ai = await getGeminiClient();
  const response = await Promise.race([
    ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
    }),
    new Promise((_, reject) => {
      windowlessSetTimeout(() => reject(new Error('Gemini request timed out.')), GEMINI_TIMEOUT_MS);
    }),
  ]);

  return {
    provider: 'gemini',
    model: DEFAULT_GEMINI_MODEL,
    response: extractGeminiText(response),
  };
};

const windowlessSetTimeout = (callback, timeoutMs) => setTimeout(callback, timeoutMs);

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
    await auditGatewayEvent({
      req,
      provider,
      success: false,
      details: { message: error.message },
    });

    const message = isCommander
      ? 'Local commander model is unavailable. Start Ollama locally or configure OLLAMA_BASE_URL to a private reachable endpoint.'
      : 'Cloud intelligence model is unavailable.';

    return res.status(error.statusCode || 503).json({
      success: false,
      provider,
      message,
    });
  }
});

module.exports = {
  MASTER_ROLE,
  processIntelligencePrompt,
};
