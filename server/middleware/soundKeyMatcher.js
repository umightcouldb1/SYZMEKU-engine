const DEFAULT_SOUND_KEY = 445;
const MATCH_TOLERANCE = 2;

const resolveSoundKey = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SOUND_KEY;
};

const soundKeyMatcher = (req, res, next) => {
  const headerFrequency = Number(req.headers['x-codex-frequency']);
  const bodyFrequency = typeof req.body?.frequency === 'number' ? req.body.frequency : Number(req.body?.frequency);
  const frequency = Number.isFinite(headerFrequency) ? headerFrequency : bodyFrequency;

  const soundKey = resolveSoundKey(process.env.RESONANCE_KEY);

  if (Number.isFinite(frequency)) {
    const isMatch = Math.abs(frequency - soundKey) <= MATCH_TOLERANCE;
    if (isMatch) {
      req.codexMatch = true;
      req.codexMeta = {
        harmonicKey: `${soundKey}Hz`,
        ketsuronStatus: 'COMPLETE',
        scrollTrigger: true,
      };
    }
  }

  next();
};

module.exports = { soundKeyMatcher };
