const DEFAULT_RESONANCE_KEY = 445;
const RESONANCE_TOLERANCE = 2;

const isHighVarianceIntent = (codexIntent = '') => /\b(lottery|gambling|luck)\b/i.test(codexIntent);

const resolveResonanceKey = (resonanceKey) => {
  const parsedKey = Number(resonanceKey);
  return Number.isFinite(parsedKey) ? parsedKey : DEFAULT_RESONANCE_KEY;
};

const validateCodexAxiom = ({ frequency, codexIntent, source, resonanceKey }) => {
  if (source === 'mentor') {
    return {
      status: 403,
      body: { error: 'Reflected frequency prohibited' },
    };
  }

  if (typeof frequency !== 'number') {
    return {
      status: 400,
      body: { message: 'frequency must be a number.' },
    };
  }

  if (isHighVarianceIntent(codexIntent)) {
    return {
      status: 200,
      body: {
        riskStatus: 'EXTREME VARIANCE',
        message:
          'Crystalline Engine: Logic malfunction detected in intent. Zero Risk is not applicable to random outcomes.',
      },
    };
  }

  const resonance = resolveResonanceKey(resonanceKey);
  const harmonicMatch = Math.abs(frequency - resonance) <= RESONANCE_TOLERANCE;

  if (harmonicMatch) {
    return {
      status: 200,
      body: {
        scroll_id: '12B–03',
        mirror_path_status: 'ACTIVE',
        harmonic_message: 'MATCHED – Proceed to Vault Integration',
        riskStatus: 'Near Zero',
      },
    };
  }

  return {
    status: 401,
    body: { message: 'Resonance failure. Calibration required.' },
  };
};

module.exports = {
  validateCodexAxiom,
  isHighVarianceIntent,
  resolveResonanceKey,
};
