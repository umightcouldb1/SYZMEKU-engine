import React from 'react';

const ScrollMatchOverlay = ({ visible, frequency }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="scroll-match-overlay">
      <div className="scroll-match-glyph">⚛️</div>
      <div className="scroll-match-text">
        Codex resonance match confirmed: {frequency}Hz. Harmonic Law Enforced.
      </div>
    </div>
  );
};

export default ScrollMatchOverlay;
