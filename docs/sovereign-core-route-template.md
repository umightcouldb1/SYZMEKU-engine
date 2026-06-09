# Sovereign Core Route Template

This route file is intentionally documentation-only. Do not place this route into the runtime router until the final obscured mount path is chosen.

```js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireCommanderInChief } = require('../middleware/checkRole');
const {
  createSovereignAsset,
  getSovereignAssets,
  getSovereignAsset,
  updateSovereignAsset,
  createLineageMilestone,
  getLineageMilestones,
  getLineageMilestone,
  updateLineageMilestone,
} = require('../controllers/sovereignController');

router.use(protect, requireCommanderInChief);

router
  .route('/assets')
  .get(getSovereignAssets)
  .post(createSovereignAsset);

router
  .route('/assets/:id')
  .get(getSovereignAsset)
  .patch(updateSovereignAsset);

router
  .route('/milestones')
  .get(getLineageMilestones)
  .post(createLineageMilestone);

router
  .route('/milestones/:id')
  .get(getLineageMilestone)
  .patch(updateLineageMilestone);

router.get('/master/operations', (req, res) => {
  res.status(200).json({ success: true, message: 'Sovereign Core Connection Active.' });
});

module.exports = router;
```

Runtime mount pattern, once the private route string is selected:

```js
router.use('/api/v1/<private-obscured-path>', require('./path/to/sovereignRoutes'));
```
