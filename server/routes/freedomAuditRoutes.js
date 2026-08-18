const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createFreedomAuditCheckout,
  getFreedomAuditEntitlement,
  verifyFreedomAuditSession,
  scoreFreedomAudit,
} = require('../controllers/freedomAuditController');

router.get('/entitlement', protect, getFreedomAuditEntitlement);
router.post('/checkout/session', protect, createFreedomAuditCheckout);
router.post('/checkout/verify', protect, verifyFreedomAuditSession);
router.post('/results', protect, scoreFreedomAudit);

module.exports = router;
