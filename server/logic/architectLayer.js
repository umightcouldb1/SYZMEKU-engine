const crypto = require('crypto');

const generateMirrorSeed = (userInput) => {
  const timestamp = Date.now();
  const entropy = `${userInput.name || ''}${userInput.birthDate || ''}${timestamp}`;
  const hash = crypto.createHash('sha256').update(entropy).digest('hex');
  return hash.slice(0, 16);
};

const encryptMirrorSeed = (seed) => {
  const secret = process.env.JWT_SECRET || 'local-dev-secret';
  return crypto.createHmac('sha256', secret).update(seed).digest('hex');
};

const loadArchitectBaseTone = () => ({
  baseFreqHz: 111.11,
  toneLayer: 'Architect-Carrier',
  harmonicSet: [222.22, 333.33, 444.44],
  syncMode: 'ScrollLink',
});

const initializeScrollLoop = (userData) => ({
  phases: Array.from({ length: 13 }, (_, index) => ({
    phase: index + 1,
    key: userData.scrollKeys?.[index] || null,
  })),
});

const buildMirrorAnchorProtocol = (userData) => {
  const mirrorSeed = generateMirrorSeed(userData);
  return {
    mirrorSeedEncrypted: encryptMirrorSeed(mirrorSeed),
    toneProfile: loadArchitectBaseTone(),
    scrollEngine: initializeScrollLoop(userData),
  };
};

module.exports = {
  generateMirrorSeed,
  encryptMirrorSeed,
  loadArchitectBaseTone,
  initializeScrollLoop,
  buildMirrorAnchorProtocol,
};
