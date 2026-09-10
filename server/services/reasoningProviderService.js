const {
  error
} = require('./reasoningCapabilityService');
const ALIASES = ['GEMINI_API_KEY', 'Gemini_API_Key', 'Gemini_API_KEY'];
function configuration(purpose, provider = 'gemini', env = process.env) {
  const keys = [...new Set(ALIASES.map(k => env[k]).filter(Boolean))];
  if (provider === 'gemini' && keys.length !== 1) throw error(keys.length ? 'MODEL_CONFIG_CONFLICT' : 'MODEL_NOT_CONFIGURED', 'Model configuration is unavailable.', 503);
  const alias = {
    mentor: 'MENTOR_MODEL',
    analyze: 'MENTOR_MODEL',
    vision: 'MENTOR_MODEL',
    reflection: 'MENTOR_MODEL',
    recommend: 'SIGNAL_MODEL',
    planner: 'STRATEGIC_MODEL',
    'agent-plan': 'STRATEGIC_MODEL'
  }[purpose];
  return {
    provider,
    key: keys[0],
    model: provider === 'ollama' ? env.OLLAMA_MODEL || 'llama3' : env[alias] || env.DEFAULT_MODEL || 'gemini-2.5-flash'
  };
}
async function generate({
  purpose,
  prompt,
  media,
  provider = 'gemini',
  signal
}) {
  if (!['gemini', 'ollama'].includes(provider)) throw error('MODEL_NOT_CONFIGURED', 'Unknown model provider.', 503);
  const c = configuration(purpose, provider);
  const url = provider === 'gemini' ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent` : (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '') + '/api/generate';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(provider === 'gemini' ? {
          'x-goog-api-key': c.key
        } : {})
      },
      body: JSON.stringify(provider === 'gemini' ? {
        contents: [{
          parts: [{
            text: prompt
          }, ...(media ? [{
            inline_data: {
              mime_type: media.mimeType,
              data: media.data
            }
          }] : [])]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 4096
        }
      } : {
        model: c.model,
        prompt,
        stream: false,
        format: 'json'
      })
    });
  } catch (e) {
    throw error(signal?.aborted ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE', signal?.aborted ? 'Model request timed out.' : 'Configured model is unavailable.', signal?.aborted ? 504 : 503);
  }
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel();
    const err = error(status === 429 ? 'MODEL_RATE_LIMITED' : [401, 403].includes(status) ? 'MODEL_CREDENTIAL_REJECTED' : 'MODEL_UPSTREAM_ERROR', 'The model could not complete this request.', status === 429 ? 429 : [401, 403].includes(status) ? 503 : 502);
    const retry = Number(response.headers.get('retry-after'));
    if (status === 429 && Number.isFinite(retry) && retry > 0) err.retryAfterSeconds = Math.min(retry, 300);
    throw err;
  }
  const reader = response.body.getReader();
  let bytes = 0,
    chunks = [];
  try {
    while (true) {
      const {
        done,
        value
      } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 262144) {
        await reader.cancel();
        throw error('MODEL_OUTPUT_INVALID', 'Model output exceeded the limit.', 502);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (e) {
    if (e.reasoningError) throw e;
    if (signal?.aborted) throw error('MODEL_TIMEOUT', 'Model request timed out.', 504);
    throw error('MODEL_UPSTREAM_ERROR', 'Model response could not be read.', 502);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw error('MODEL_OUTPUT_INVALID', 'Invalid provider response.', 502);
  }
  return {
    text: provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') : data.response,
    provider,
    model: c.model
  };
}
module.exports = {
  configuration,
  generate
};
