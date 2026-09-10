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
router.use('/capital', require('./capitalLedgerRoutes'));
router.use('/ai', require('./aiGatewayRoutes'));
router.use('/freedom-audit', require('./freedomAuditRoutes'));
router.use('/social-command', require('./socialCommandRoutes'));
router.use('/', require('./stripeRoutes'));

// M3 owns explicit personal dispatch when enabled; disabled accounts retain M1/M2.
router.use('/core', require('./reasoningRoutes'));
// Keep the lineage-aware analyzer ahead of the legacy core router.
router.use('/core/analyze', require('./memoryAnalyzeRoutes'));
router.use('/core/patterns', require('./patternRoutes'));
router.use('/core', require('./coreContextRoutes'));
router.use('/core', require('./API/coreRoutes'));
router.use((error, _req, res, next) => {
  if (error.code !== 'CORE_SCOPE_REQUIRED') return next(error);
  return res.status(error.statusCode || 403).json({ code: error.code, message: error.message });
});

module.exports = router;
