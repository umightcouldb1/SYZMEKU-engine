const router = require('express').Router();

const SENTIMENT_STATUS = Object.freeze({
  service: 'Sentiment-analysis',
  status: 'active',
  layer: 'accessible_intelligence',
  theme: 'BigSis_Final',
});

router.get('/status', (_req, res) => {
  console.log(`[SENTIMENT_ANALYSIS] ${SENTIMENT_STATUS.status}`);
  return res.status(200).json(SENTIMENT_STATUS);
});

module.exports = router;
