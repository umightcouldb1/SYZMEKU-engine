const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { mirrorLogic } = require('../../middleware/mirror-logic');

const router = express.Router();

const validateIntakeFields = (req, res, next) => {
  const { name, email, dob } = req.body;

  if (!name || !email || !dob) {
    res.status(400).json({ message: 'Missing required intake fields.' });
    return;
  }

  next();
};

router.post(
  '/',
  validateIntakeFields,
  mirrorLogic,
  expressAsyncHandler(async (req, res) => {
    const {
      name,
      email,
      dob,
      frequency,
      codex_intent: codexIntent,
      shadow_code: shadowCode,
      resonance_color: resonanceColor,
    } = req.body;
    const codexValidation = res.locals.codexValidation;
    const matchConfirmed = codexValidation?.mirror_path_status === 'ACTIVE';

    res.status(200).json({
      status: 'INTAKE_RECEIVED',
      matchConfirmed,
      scrollAssignment: matchConfirmed ? 'Scroll 12B–03' : null,
      intake: {
        name,
        email,
        dob,
        frequency,
        codex_intent: codexIntent || '',
        shadow_code: shadowCode || '',
        resonance_color: resonanceColor || '',
      },
      codex: codexValidation,
    });
  }),
);

module.exports = router;
