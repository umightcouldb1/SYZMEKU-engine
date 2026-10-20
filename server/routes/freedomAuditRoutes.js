const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createFreedomAuditCheckout,
  getFreedomAuditEntitlement,
  verifyFreedomAuditSession,
  scoreFreedomAudit,
  getFreedomAuditResults,
} = require('../controllers/freedomAuditController');

router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/entitlement', protect, getFreedomAuditEntitlement);
router.post('/checkout/session', protect, createFreedomAuditCheckout);
router.post('/checkout/verify', protect, verifyFreedomAuditSession);
router.get('/results', protect, getFreedomAuditResults);
const generationLimiter = require('express-rate-limit')({windowMs:60*60*1000, limit:30, keyGenerator:req=>String(req.user._id), standardHeaders:true, legacyHeaders:false, message:{error:'Plan generation limit reached. Please try again in an hour.'}});
router.post('/results', protect, generationLimiter, scoreFreedomAudit);
// Keep provider errors structured and private even when mounted without a global JSON error handler.
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
  res.status(status).json({error: status === 500 ? 'The audit could not be saved. Please retry.' : err.message});
});

module.exports = router;
