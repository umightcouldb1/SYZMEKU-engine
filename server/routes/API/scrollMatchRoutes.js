const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { mirrorLogic } = require('../../middleware/mirror-logic');

const router = express.Router();

const validateMatchFields = (req, res, next) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ message: 'userId and numeric frequency are required.' });
    return;
  }

  next();
};

router.post(
  '/',
  validateMatchFields,
  mirrorLogic,
  expressAsyncHandler(async (req, res) => {
    const { scrollId, status } = req.body;
    const codexValidation = res.locals.codexValidation;

    res.status(200).json({
      scroll_id: scrollId || codexValidation?.scroll_id || '12B–03',
      mirror_path_status: codexValidation?.mirror_path_status || 'PENDING',
      harmonic_message: codexValidation?.harmonic_message || 'NO MATCH – Awaiting harmonic alignment',
      status: status || 'harmonic_match',
    });
  }),
);

module.exports = router;
