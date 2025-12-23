const DEFAULT_HARMFUL_INTENTS = [
  'force',
  'coerce',
  'compel',
  'bind',
  'manipulate',
  'override',
  'possess',
  'hack',
];

const normalizeTargets = (targets) => {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets.filter((target) => typeof target === 'string' && target.trim().length > 0);
};

const violatesFreeWill = (command, harmfulIntents = DEFAULT_HARMFUL_INTENTS) => {
  if (!command) {
    return false;
  }

  const targets = normalizeTargets(command.targets);
  if (targets.length === 0) {
    return false;
  }

  if (command.explicitConsent) {
    return false;
  }

  const textLower = String(command.text || '').toLowerCase();
  const hasHarmfulIntent = harmfulIntents.some((word) => textLower.includes(word));

  return hasHarmfulIntent;
};

const codexHarmFilter = (req, res, next) => {
  const userCommand = req.body;

  if (violatesFreeWill(userCommand)) {
    return res.status(403).json({
      message:
        'Action paused: Potential free will violation detected. If you have explicit consent, provide confirmation. Otherwise, recalibrate your request.',
    });
  }

  return next();
};

module.exports = {
  codexHarmFilter,
  violatesFreeWill,
};
