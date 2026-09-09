const { getRequestContext, runWithRequestContext } = require('../utils/requestContext');

const scopeError = (message = 'Authenticated personal Core scope is required.', status = 403) =>
  Object.assign(new Error(message), { status, statusCode: status, code: 'CORE_SCOPE_REQUIRED' });

const requireCoreScope = (expectedUserId) => {
  const scope = getRequestContext();
  if (scope.authenticated !== true || !/^[a-f\d]{24}$/i.test(String(scope.userId || '')) || !scope.sessionId) {
    throw scopeError();
  }
  if (expectedUserId && String(expectedUserId) !== String(scope.userId)) {
    throw scopeError('Personal Core scope does not match the requested owner.');
  }
  return { ...scope, userId: String(scope.userId) };
};

const coreCapabilities = (user = {}) => ({
  operator: user.role === 'COMMANDER_IN_CHIEF',
  personalContext: ['USER', 'COMMANDER_IN_CHIEF'].includes(user.role),
});

const requireCoreWrite = () => {
  requireCoreScope();
  if (process.env.CORE_CONTEXT_WRITES_ENABLED !== 'true') throw scopeError('Personal Core writes are paused for maintenance.', 503);
};

const rejectOwnerFields = (payload = {}) => {
  for (const key of Object.keys(payload)) {
    if (['userId', 'user_id', 'owner', 'scope', 'singletonKey', 'authenticated', 'sessionId'].includes(key) || key.startsWith('$') || key.includes('.')) {
      throw scopeError('Ownership and internal fields cannot be supplied by a client.', 400);
    }
  }
};

// Re-authenticate captured sessions on every background tick. No ownerless boot restore.
const runAuthenticatedCoreJob = async (principal, callback) => {
  if (process.env.CORE_CONTEXT_WRITES_ENABLED !== 'true') throw scopeError('Personal Core jobs are paused for maintenance.', 503);
  const AuthSession = require('../models/AuthSession');
  const User = require('../models/User');
  if (!principal?.sessionId || !principal?.userId) throw scopeError();
  const session = await AuthSession.findOne({ sessionId: principal.sessionId, userId: principal.userId, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
  const user = session && await User.findById(principal.userId).select('role').lean();
  if (!session || !user || !coreCapabilities(user).operator) throw scopeError('The operator session is no longer authorized.');
  return runWithRequestContext({ userId: user._id, sessionId: session.sessionId, authenticated: true }, callback);
};

const runtime = new Map();
const invalidators = new Set();
const onCoreInvalidation = callback => invalidators.add(callback);
const readCoreRuntime = name => runtime.get(`${name}:${requireCoreScope().userId}`);
const scopedRuntime = (name, factory) => new Proxy({}, {
  get(_target, key) {
    const id = requireCoreScope().userId;
    const stateKey = `${name}:${id}`;
    if (!runtime.has(stateKey)) runtime.set(stateKey, factory());
    return runtime.get(stateKey)[key];
  },
  set(_target, key, value) {
    const id = requireCoreScope().userId;
    const stateKey = `${name}:${id}`;
    if (!runtime.has(stateKey)) runtime.set(stateKey, factory());
    runtime.get(stateKey)[key] = value;
    return true;
  },
});

const invalidateCoreRuntime = () => {
  const id = requireCoreScope().userId;
  for (const key of runtime.keys()) {
    if (!key.endsWith(`:${id}`)) continue;
    const value = runtime.get(key);
    if (value.timer) clearInterval(value.timer);
    runtime.delete(key);
  }
  for (const callback of invalidators) callback(id);
};

module.exports = { requireCoreScope, requireCoreWrite, scopeError, coreCapabilities, rejectOwnerFields, runAuthenticatedCoreJob, scopedRuntime, invalidateCoreRuntime, onCoreInvalidation, readCoreRuntime };
