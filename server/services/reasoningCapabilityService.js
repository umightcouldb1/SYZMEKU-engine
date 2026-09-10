const {
  requireCoreScope,
  requireCoreWrite
} = require('./coreScopeService');
function error(code, message, status = 400) {
  return Object.assign(new Error(message), {
    code,
    status,
    statusCode: status,
    reasoningError: true
  });
}
function enabled() {
  const {
    userId
  } = requireCoreScope();
  const ids = String(process.env.CORE_REASONING_USER_IDS || '').split(',').map(x => x.trim().toLowerCase());
  return process.env.CORE_REASONING_RECONCILIATION_ENABLED === 'true' && ids.every(x => /^[a-f\d]{24}$/.test(x)) && ids.includes(userId.toLowerCase());
}
function requireRead() {
  if (!enabled()) throw error('REASONING_UNAVAILABLE', 'Reasoning is not available for this account.', 404);
}
async function recheck({
  write = false
} = {}) {
  requireRead();
  if (write) {
    try {
      requireCoreWrite();
    } catch (e) {
      throw error('CONTEXT_WRITES_PAUSED', e.message, 503);
    }
  }
  const {
    userId,
    sessionId
  } = requireCoreScope();
  if (!(await require('../models/AuthSession').exists({
    userId,
    sessionId,
    revokedAt: null,
    expiresAt: {
      $gt: new Date()
    }
  }))) throw error('AUTH_REQUIRED', 'Sign in again.', 401);
}
module.exports = {
  error,
  enabled,
  requireRead,
  recheck
};
