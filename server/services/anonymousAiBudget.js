// Anonymous demo bounds only. These counters are process-local: replicas multiply
// allowances and restarts reset them. Use a shared atomic store and provider-side
// spending limits before scaling. Attempts (including failures/timeouts) consume
// budget. SDK abort cancels the client request, not provider computation/billing.
const LIMITS = Object.freeze({ promptCharacters: 4000, promptBytes: 16000,
  maxOutputTokens: 512, timeoutMs: 15000, concurrent: 3,
  requests: 100, windowMs: 24 * 60 * 60 * 1000 });
const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
function createAnonymousAiBudget({ limits = LIMITS, now = Date.now } = {}) {
  let active = 0, used = 0, windowStart = now();
  return async function run(prompt, generate, response) {
    if (prompt.length > limits.promptCharacters || Buffer.byteLength(prompt, 'utf8') > limits.promptBytes) {
      throw failure('Demo prompt is too long.', 413);
    }
    if (now() - windowStart >= limits.windowMs) { used = 0; windowStart = now(); }
    if (used >= limits.requests) throw failure('Demo request budget exhausted. Please try again later.', 429);
    if (active >= limits.concurrent) throw failure('Demo is busy. Please try again later.', 429);
    used += 1; active += 1;
    const controller = new AbortController();
    let timer, onClose;
    const canceled = new Promise((_, reject) => {
      const cancel = message => { controller.abort(); reject(failure(message, 504)); };
      timer = setTimeout(() => cancel('Demo request timed out.'), limits.timeoutMs);
      onClose = () => { if (!response.writableEnded) cancel('Demo request disconnected.'); };
      response?.on?.('close', onClose);
    });
    // Retain the concurrency slot until the provider promise actually settles,
    // even if it ignores cancellation. Do not admit unlimited orphan requests.
    const pending = Promise.resolve().then(() => generate({ maxOutputTokens: limits.maxOutputTokens,
      abortSignal: controller.signal })).finally(() => { active -= 1; });
    try { return await Promise.race([pending, canceled]); }
    finally { clearTimeout(timer); response?.removeListener?.('close', onClose); }
  };
}
module.exports = { LIMITS, createAnonymousAiBudget, runAnonymousAi: createAnonymousAiBudget() };
