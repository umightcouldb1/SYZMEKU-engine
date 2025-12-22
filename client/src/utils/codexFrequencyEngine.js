export const CODEX_TONES = [
  { frequency: 107, activationKey: 'scroll-1-anchor', label: 'Origin frequency' },
  { frequency: 309, activationKey: 'whale-vault-resonance', label: 'Whale Vault resonance' },
  { frequency: 445, activationKey: 'trinity-merge-tone', label: 'Trinity Merge Tone' },
  { frequency: 481, activationKey: 'sovereign-self-affirmation', label: 'Sovereign Self affirmation' },
];

export const findCodexMatch = (frequency, tolerance = 3) => {
  return CODEX_TONES.find(
    (tone) => Math.abs(tone.frequency - frequency) <= tolerance,
  );
};

export const getDominantFrequency = (analyser, audioContext) => {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  let maxValue = 0;
  let maxIndex = 0;

  dataArray.forEach((value, index) => {
    if (value > maxValue) {
      maxValue = value;
      maxIndex = index;
    }
  });

  const nyquist = audioContext.sampleRate / 2;
  const frequency = (maxIndex * nyquist) / bufferLength;

  return { frequency, amplitude: maxValue };
};
