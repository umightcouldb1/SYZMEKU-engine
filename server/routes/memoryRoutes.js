const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { getOrCreateLineageMemory } = require('../services/lineageMemoryService');

router.use(protect);

router.get('/', async (req, res) => {
  const { memory, sovereignContext } = await getOrCreateLineageMemory(req.user._id);

  return res.json({
    success: true,
    conversationHistory: memory.conversationHistory || [],
    sovereignContext,
    status: 'Lineage Sync Established',
    updatedAt: memory.updatedAt,
  });
});

router.delete('/conversation', async (req, res) => {
  const { memory, sovereignContext } = await getOrCreateLineageMemory(req.user._id);
  memory.conversationHistory = [];
  await memory.save();

  return res.json({
    success: true,
    conversationHistory: [],
    sovereignContext,
    status: 'Lineage Sync Established',
  });
});

module.exports = router;
