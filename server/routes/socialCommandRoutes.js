const router = require('express').Router();
const User = require('../models/User');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  listSocialProviders,
  beginAuthorization,
  handleOAuthCallback,
  listConnections,
  disconnectConnection,
  refreshConnectionToken,
  generateCampaign,
  seedFreedomAuditCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  approveCampaign,
  publishNow,
  scheduleCampaign,
  processSchedule,
  refreshAnalytics,
} = require('../controllers/socialCommandController');

router.get('/oauth/:provider/callback', handleOAuthCallback);

router.use(protect);
router.get('/providers', listSocialProviders);
router.post('/connections/:provider/authorize', beginAuthorization);
router.get('/connections', listConnections);
router.delete('/connections/:connectionId', disconnectConnection);
router.post('/connections/:connectionId/refresh', refreshConnectionToken);
router.post('/campaigns/generate', generateCampaign);
router.post('/campaigns/freedom-audit-launch', seedFreedomAuditCampaign);
router.get('/campaigns', listCampaigns);
router.get('/campaigns/:campaignId', getCampaign);
router.put('/campaigns/:campaignId', updateCampaign);
router.post('/campaigns/:campaignId/approve', approveCampaign);
router.post('/campaigns/:campaignId/publish', publishNow);
router.post('/campaigns/:campaignId/posts/:postId/publish', publishNow);
router.post('/campaigns/:campaignId/schedule', scheduleCampaign);
router.post('/campaigns/:campaignId/analytics/refresh', refreshAnalytics);
router.post('/scheduler/run-due', authorizeRoles(User.ROLES.COMMANDER_IN_CHIEF, 'founder', 'admin'), processSchedule);

module.exports = router;
