const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { requireCommanderInChief } = require('../middleware/checkRole');
const {
  getAutomationStatus,
  listAutomationLogs,
  generatePartnershipDeck,
  generateOutreachDraft,
} = require('../controllers/academyAutomationController');

router.use(protect, requireCommanderInChief);
router.get('/status', getAutomationStatus);
router.get('/logs', listAutomationLogs);
router.post('/partnership/deck-draft', generatePartnershipDeck);
router.post('/partnership/outreach-draft', generateOutreachDraft);

module.exports = router;
