const router = require('express').Router();

// Seal the pathways to individual logic modules
router.use('/auth', require('./authRoutes'));
router.use('/fixes', require('./fixesRoutes'));
router.use('/codex-command', require('./codexRoutes'));

module.exports = router;
