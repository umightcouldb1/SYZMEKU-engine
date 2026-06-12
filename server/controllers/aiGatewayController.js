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

const sanitizePrompt = (value) => String(value || '').trim();

const getPromptFromRequest = (req) => sanitizePrompt(req.body?.prompt || req.body?.message || req.body?.input);

const getGeminiApiKey = () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return process.env.GEMINI_API_KEY;
};

const extractGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((part) => part?.text || '').filter(Boolean).join('\n').trim();
  }
  return '';
};

const processWithGemini = async (prompt) => {
  const apiKey = getGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_GEMINI_MODEL)}:generateContent`;
  const { data } = await axios.post(
    url,
    {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    },
    {
      params: { key: apiKey },
      timeout: GEMINI_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    },
  );

  return {
    provider: 'gemini',
    model: DEFAULT_GEMINI_MODEL,
    response: extractGeminiText(data),
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
