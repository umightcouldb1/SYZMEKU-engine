const User = require('../models/User');

const unavailable = () => Object.assign(
  new Error('Account enrollment is temporarily unavailable. Please try again later.'),
  { code: 'AUTH_IDENTITY_INDEX_UNAVAILABLE', statusCode: 503 },
);

const ensureIdentityIndex = async () => {
  try {
    // Await any configured automatic index build, then inspect the real index.
    // init() alone is insufficient when production disables automatic indexing.
    await User.init();
    const indexes = await User.collection.indexes();
    const ready = indexes.some(index => index.unique === true
      && Object.keys(index.key || {}).length === 1
      && index.key['identity.googleSubject'] === 1
      && Object.keys(index.partialFilterExpression || {}).length === 1
      && Object.keys(index.partialFilterExpression?.['identity.googleSubject'] || {}).length === 2
      && index.partialFilterExpression?.['identity.googleSubject']?.$type === 'string'
      && index.partialFilterExpression?.['identity.googleSubject']?.$gt === '');
    if (!ready) throw unavailable();
  } catch (_error) {
    // Database diagnostics must not leak through public authentication responses.
    throw unavailable();
  }
};

module.exports = { ensureIdentityIndex };
