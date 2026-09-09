const { AsyncLocalStorage } = require('async_hooks');

const requestContextStorage = new AsyncLocalStorage();

// Await lazy thenables (including Mongoose queries) inside the scope, not at the caller.
const runWithRequestContext = (context, callback) => requestContextStorage.run(context, async () => await callback());
const getRequestContext = () => requestContextStorage.getStore() || {};

module.exports = {
  getRequestContext,
  runWithRequestContext,
};
