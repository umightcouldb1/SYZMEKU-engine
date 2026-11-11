// Absent versions are legacy version zero. Malformed versions fail closed.
const versionOf = (value) => value === undefined ? 0
  : Number.isSafeInteger(value) && value >= 0 ? value : null;
const authVersionOf = (user) => {
  const version = versionOf(user?.authVersion);
  if (version === null) throw new Error('Account session version is invalid.');
  return version;
};
const isSessionCurrent = (user, session, ...tokenVersion) => {
  if (!user || !session) return false;
  const version = versionOf(user.authVersion);
  return version !== null && versionOf(session.authVersion) === version
    && (!tokenVersion.length || versionOf(tokenVersion[0]) === version);
};
const findCurrentSession = async ({ userId, sessionId }) => {
  const session = await require('../models/AuthSession').findOne({
    userId, sessionId, revokedAt: null, expiresAt: { $gt: new Date() },
  }).lean();
  const user = session && await require('../models/User').findById(userId).select('role authVersion').lean();
  return isSessionCurrent(user, session) ? { user, session } : null;
};
module.exports = { authVersionOf, isSessionCurrent, findCurrentSession };
