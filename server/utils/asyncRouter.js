const express = require('express');

module.exports = () => {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(handler =>
      (req, res, next) => {
        try { Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
      }));
  }
  return router;
};
