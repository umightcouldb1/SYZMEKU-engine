const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const { requireCommanderInChief } = require('../middleware/checkRole');
const { processIntelligencePrompt } = require('../controllers/aiGatewayController');

// Public/user cloud path. Unauthenticated callers are forced through Gemini only.
const demoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, provider: 'gemini', message: 'Demo request limit reached. Please try again later.' } });
router.post('/public/intelligence', demoLimiter, processIntelligencePrompt);

// Authenticated auto-router. USER traffic goes to Gemini; COMMANDER_IN_CHIEF traffic goes to Ollama.
router.post('/intelligence', protect, processIntelligencePrompt);

// Stealth commander path. Non-commanders receive 404 from requireCommanderInChief.
router.post('/commander/intelligence', protect, requireCommanderInChief, processIntelligencePrompt);

module.exports = router;
