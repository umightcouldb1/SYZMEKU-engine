const { AsyncLocalStorage } = require('async_hooks');

const requestContextStorage = new AsyncLocalStorage();

const runWithRequestContext = (context, callback) => requestContextStorage.run(context, callback);
const getRequestContext = () => requestContextStorage.getStore() || {};

module.exports = {
  getRequestContext,
  runWithRequestContext,
};
