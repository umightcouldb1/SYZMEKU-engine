const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { validateCodexAxiom } = require('../../logic/codexIntakeMirror');

const router = express.Router();

router.post(
  '/',
  expressAsyncHandler(async (req, res) => {
    const { userId, frequency, scrollId, status } = req.body;

    if (!userId) {
      res.status(400).json({ message: 'userId and numeric frequency are required.' });
      return;
    }

    const codexValidation = validateCodexAxiom({
      frequency,
    });

    if (codexValidation.status !== 200) {
      res.status(codexValidation.status).json(codexValidation.body);
      return;
    }

    res.status(200).json({
      scroll_id: scrollId || codexValidation.body.scroll_id || '12B–03',
      mirror_path_status: codexValidation.body.mirror_path_status || 'PENDING',
      harmonic_message: codexValidation.body.harmonic_message || 'NO MATCH – Awaiting harmonic alignment',
      status: status || 'harmonic_match',
    });
  }),
);

module.exports = router;
