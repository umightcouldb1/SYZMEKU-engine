const { validateCodexAxiom, resolveResonanceKey } = require('../logic/codexIntakeMirror');

const mirrorLogic = (req, res, next) => {
  const { frequency, codex_intent: codexIntent, source } = req.body;
  const resonanceKey = resolveResonanceKey(process.env.RESONANCE_KEY);
  const codexValidation = validateCodexAxiom({
    frequency,
    codexIntent,
    source,
    resonanceKey,
  });

  if (codexValidation.status !== 200) {
    return res.status(codexValidation.status).json(codexValidation.body);
  }

  if (codexValidation.body?.riskStatus === 'EXTREME VARIANCE') {
    return res.status(200).json(codexValidation.body);
  }

  const matchConfirmed = codexValidation.body?.mirror_path_status === 'ACTIVE';

  req.codexMatch = matchConfirmed;
  req.codexMeta = matchConfirmed
    ? {
        harmonicKey: `${resonanceKey}Hz`,
        ketsuronStatus: 'COMPLETE',
        scrollId: codexValidation.body?.scroll_id || '12B–03',
      }
    : null;
  res.locals.codexValidation = codexValidation.body;

  return next();
};

module.exports = {
  mirrorLogic,
};
