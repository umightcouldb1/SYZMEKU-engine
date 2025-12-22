const scrollSequences = {
  sequence_144: [
    { time: 0, glyphCode: '07', emotionCode: 'grace', burstCode: 'sapphire' },
    { time: 4000, glyphCode: '13', emotionCode: 'sovereign', burstCode: 'gold' },
    { time: 8000, glyphCode: '∞', emotionCode: 'core', burstCode: 'iridescent' },
  ],
};

export default function ScrollReplayEngine({ sequenceId, glyphMap, emotionMap }) {
  const replay = [];
  const base = scrollSequences[sequenceId] || [];

  base.forEach((step) => {
    replay.push({
      time: step.time,
      glyph: glyphMap[step.glyphCode],
      tone: emotionMap[step.emotionCode],
      burst: step.burstCode || null,
    });
  });

  return replay;
}
