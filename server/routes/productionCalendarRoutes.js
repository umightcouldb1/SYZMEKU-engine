'use strict';
const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const { canRead, ownerId } = require('../enterprise/policy');
const calendar = require('../enterprise/content/productionCalendar');

function createRouter({ authenticate = protect, getDb = () => mongoose.connection.db, env = process.env, service = calendar } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.use(authenticate, (req, res, next) => canRead(req.user, env) && env.CONTENT_FACTORY_ENABLED === 'true' ? next() : res.status(404).json({ code: 'NOT_FOUND' }));
  const wrap = fn => asyncHandler(async (req, res) => {
    try { await fn(req, res); } catch (error) { res.status(error.statusCode || 500).json({ code: error.statusCode ? error.message : 'PRODUCTION_CALENDAR_UNAVAILABLE' }); }
  });
  const options = () => ({ db: getDb(), owner: ownerId(env), env });
  router.get('/', wrap(async (_req, res) => res.json(await service.read(options()))));
  router.post('/window', wrap(async (req, res) => res.json(await service.setWindow({ ...options(), input: req.body }))));
  router.patch('/slots/:date', wrap(async (req, res) => res.json(await service.updateSlot({ ...options(), date: req.params.date, input: req.body }))));
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
