const router = require('express').Router();

// Seal the pathways to individual logic modules
router.use('/auth', require('./authRoutes'));
router.use('/fixes', require('./fixesRoutes'));
router.use('/codex-command', require('./codexRoutes'));
router.use('/mirror', require('./mirrorRoutes'));
router.use('/scrolltones', require('./scrolltoneRoutes'));
router.use('/crystalline', require('./crystallineRoutes'));
router.use('/scroll-intake', require('./scrollIntakeRoutes'));
router.use('/scroll-match', require('./scrollMatchRoutes'));

module.exports = router;
