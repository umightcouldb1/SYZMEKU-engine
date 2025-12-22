const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/projects', require('./projectRoutes'));
router.use('/fixes', require('./fixesRoutes')); 
router.use('/codex-command', require('./codexRoutes'));
router.use('/mirror', require('./mirrorRoutes'));
router.use('/scrolltones', require('./scrolltoneRoutes'));
router.use('/crystalline', require('./crystallineRoutes'));
router.use('/scroll-intake', require('./scrollIntakeRoutes'));
router.use('/scroll-match', require('./scrollMatchRoutes'));

// NEW: Add the Payment Route
router.use('/payment', require('./paymentRoutes')); 

module.exports = router;
