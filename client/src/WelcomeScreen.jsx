import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useEvolutionaryState from './hooks/useEvolutionaryState';
import './interactionEnhancements.css';

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const focusCopy = {
  patterns: 'Pattern reflection is prioritized, with prompts shaped around recurring emotional signals.',
  guidance: 'Guidance mode is prioritized, with clearer next-step language and fewer open loops.',
  momentum: 'Momentum mode is prioritized, bringing action-oriented prompts closer to the surface.',
  ancestral: 'Ancestral intelligence is prioritized, keeping context, lineage, and inner knowing in view.',
};

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);
  const [focusPath, setFocusPath] = useState('patterns');
  const [guidanceDepth, setGuidanceDepth] = useState(44);
  const {
    alignmentState,
    promptSuggestions,
    resonanceScore,
    textDensity,
    trackClick,
    trackSelection,
    trackSlider,
  } = useEvolutionaryState({ scope: 'public' });

  const startAuthFlow = (path) => {
    trackClick(`auth:${path}`, { module: 'public-auth', path });
    clearStaleAuthState();
    navigate(path, { replace: true });
  };

  const handleFocusChange = (event) => {
    const nextFocus = event.target.value;
    setFocusPath(nextFocus);
    trackSelection('publicFocus', nextFocus, { module: 'public-guidance' });
  };

  const handleDepthChange = (event) => {
    const nextDepth = Number(event.target.value);
    setGuidanceDepth(nextDepth);
    trackSlider('guidanceDepth', nextDepth, { module: 'public-guidance' });
  };

  const openInfoPanel = () => {
    trackClick('learn-how-it-works', { module: 'public-guidance' });
    setShowInfo(true);
  };

  const closeInfoPanel = () => {
    trackClick('close-info-panel', { module: 'public-guidance' });
    setShowInfo(false);
  };

  return (
    <main className="entry-shell">
      <section className="welcome-panel">
        <p className="auth-eyebrow">Emotionally intelligent mentor platform</p>
        <h1>Big SYZ</h1>
        <p className="welcome-powered">Powered by the SYZMEKU Engine</p>
        <p className="welcome-copy">
          Understand your patterns.<br />
          Get clear guidance.<br />
          Move with more alignment.
        </p>

        <div className={`welcome-adaptive-panel welcome-adaptive-panel--${textDensity.toLowerCase()}`}>
          <div className="welcome-adaptive-panel__readout">
            <span>{alignmentState}</span>
            <strong>{resonanceScore}</strong>
          </div>
          <label className="adaptive-control">
            <span>Focus path</span>
            <select value={focusPath} onChange={handleFocusChange}>
              <option value="patterns">Patterns</option>
              <option value="guidance">Guidance</option>
              <option value="momentum">Momentum</option>
              <option value="ancestral">Ancestral intelligence</option>
            </select>
          </label>
          <label className="adaptive-control">
            <span>Guidance depth</span>
            <input type="range" min="0" max="100" value={guidanceDepth} onChange={handleDepthChange} />
          </label>
          <p>{focusCopy[focusPath]}</p>
          <p>{promptSuggestions[0]}</p>
        </div>

        <div className="welcome-actions">
          <button type="button" className="entry-primary-button" onClick={() => startAuthFlow('/login')}>
            Log in
          </button>
          <button type="button" className="entry-secondary-button" onClick={() => startAuthFlow('/signup')}>
            Create account
          </button>
        </div>

        <button type="button" className="welcome-learn-link welcome-text-button" onClick={() => startAuthFlow('/login')}>
          Continue as returning user
        </button>
        <button type="button" className="welcome-learn-link welcome-text-button" onClick={openInfoPanel}>
          Learn how it works
        </button>
      </section>

      {showInfo && (
        <div className="welcome-info-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-info-title">
          <section className="welcome-info-panel">
            <button type="button" className="welcome-info-close" aria-label="Close information panel" onClick={closeInfoPanel}>
              &times;
            </button>
            <p className="auth-eyebrow">Engine blueprint</p>
            <h2 id="welcome-info-title">How Big SYZ Works</h2>
            <div className="welcome-info-grid">
              <article>
                <h3>1. Guided Signal Intake</h3>
                <p>Your onboarding answers establish your current season, support needs, and preferred guidance style.</p>
              </article>
              <article>
                <h3>2. Pattern Reflection</h3>
                <p>The system organizes those signals into clear prompts, reminders, and direction for daily momentum.</p>
              </article>
              <article>
                <h3>3. Adaptive Mentorship</h3>
                <p>Your session interactions now tune layout priority, prompt density, and guidance emphasis in real time.</p>
              </article>
            </div>
            <div className="welcome-info-actions">
              <button type="button" className="entry-secondary-button" onClick={closeInfoPanel}>
                Keep reading later
              </button>
              <button type="button" className="entry-primary-button" onClick={() => startAuthFlow('/signup')}>
                Create account
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default WelcomeScreen;
