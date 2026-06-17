const router = require('express').Router();

// Seal the pathways to individual logic modules
router.use('/auth', require('./authRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/automation', require('./academyAutomationRoutes'));
router.use('/fixes', require('./fixesRoutes'));
router.use('/codex-command', require('./codexRoutes'));
router.use('/mirror', require('./mirrorRoutes'));
router.use('/scrolltones', require('./scrolltoneRoutes'));
router.use('/crystalline', require('./crystallineRoutes'));
router.use('/scroll-intake', require('./scrollIntakeRoutes'));
router.use('/scroll-match', require('./scrollMatchRoutes'));
router.use('/mentor-system', require('./mentorSystemRoutes'));
router.use('/starburst-core', require('../starburst-core/ancestralRoutes'));
router.use('/onboarding', require('./onboardingRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/vision', require('./visionRoutes'));
router.use('/memory', require('./memoryRoutes'));
router.use('/sentiment-analysis', require('./sentimentAnalysisRoutes'));
router.use('/telemetry', require('./telemetryRoutes'));
router.use('/monetization', require('./billingRoutes'));
router.use('/ai', require('./aiGatewayRoutes'));
router.use('/', require('./stripeRoutes'));

// Keep the lineage-aware analyzer ahead of the legacy core router.
router.use('/core/analyze', require('./memoryAnalyzeRoutes'));
router.use('/core', require('./API/coreRoutes'));

module.exports = router;
