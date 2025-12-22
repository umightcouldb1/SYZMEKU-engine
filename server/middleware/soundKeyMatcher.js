const SOUND_KEY_MATCH = 445;
const MATCH_TOLERANCE = 2;

const soundKeyMatcher = (req, res, next) => {
  const headerFrequency = Number(req.headers['x-codex-frequency']);
  const bodyFrequency = typeof req.body?.frequency === 'number' ? req.body.frequency : Number(req.body?.frequency);
  const frequency = Number.isFinite(headerFrequency) ? headerFrequency : bodyFrequency;

  if (Number.isFinite(frequency)) {
    const isMatch = Math.abs(frequency - SOUND_KEY_MATCH) <= MATCH_TOLERANCE;
    if (isMatch) {
      req.codexMatch = true;
      req.codexMeta = {
        harmonicKey: `${SOUND_KEY_MATCH}Hz`,
        ketsuronStatus: 'COMPLETE',
        scrollTrigger: true,
      };
    }
  }

  next();
};

module.exports = { soundKeyMatcher };
