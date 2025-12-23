const express = require('express');
const expressAsyncHandler = require('express-async-handler');
const { validateCodexAxiom } = require('../../logic/codexIntakeMirror');

const router = express.Router();

router.post(
  '/',
  expressAsyncHandler(async (req, res) => {
    const {
      name,
      email,
      dob,
      frequency,
      codex_intent: codexIntent,
      shadow_code: shadowCode,
      resonance_color: resonanceColor,
      source,
    } = req.body;

    if (!name || !email || !dob) {
      res.status(400).json({ message: 'Missing required intake fields.' });
      return;
    }
    const codexValidation = validateCodexAxiom({
      frequency,
      codexIntent,
      source,
    });

    if (codexValidation.status !== 200) {
      res.status(codexValidation.status).json(codexValidation.body);
      return;
    }

    const matchConfirmed = codexValidation.body.mirror_path_status === 'ACTIVE';

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
      codex: codexValidation.body,
    });
  }),
);

module.exports = router;
