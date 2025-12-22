const express = require('express');
const { codexHarmFilter } = require('../../middleware/codexHarmFilter');

const router = express.Router();

router.post('/', codexHarmFilter, (req, res) => {
  res.json({
    status: 'Command executed',
    result: req.body || null,
  });
});

module.exports = router;
