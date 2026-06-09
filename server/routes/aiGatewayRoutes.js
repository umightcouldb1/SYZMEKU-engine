const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { requireCommanderInChief } = require('../middleware/checkRole');
const { processIntelligencePrompt } = require('../controllers/aiGatewayController');

// Public/user cloud path. Unauthenticated callers are forced through Gemini only.
router.post('/public/intelligence', processIntelligencePrompt);

// Authenticated auto-router. USER traffic goes to Gemini; COMMANDER_IN_CHIEF traffic goes to Ollama.
router.post('/intelligence', protect, processIntelligencePrompt);

// Stealth commander path. Non-commanders receive 404 from requireCommanderInChief.
router.post('/commander/intelligence', protect, requireCommanderInChief, processIntelligencePrompt);

module.exports = router;
