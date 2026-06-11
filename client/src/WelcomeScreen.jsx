import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useEvolutionaryState from './hooks/useEvolutionaryState';
import './interactionEnhancements.css';

const PUBLIC_API_BASE = (import.meta.env.VITE_API_URL || 'https://syzmeku-api.onrender.com').replace(/\/+$/, '');

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const focusCopy = {
  patterns: 'Pattern reflection tracks recurring emotional signals and turns them into grounded self-mastery prompts.',
  guidance: 'Guidance mode narrows the next step so the mentor engine returns practical direction instead of noise.',
  momentum: 'Momentum mode keeps action, breath, and daily integration close to the surface.',
  ancestral: 'Ancestral intelligence keeps lineage, remembrance, and inner knowing at the center of each session.',
};

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);
  const [focusPath, setFocusPath] = useState('patterns');
  const [guidanceDepth, setGuidanceDepth] = useState(44);
  const [lineageToken, setLineageToken] = useState('');
  const [mentorQuery, setMentorQuery] = useState('');
  const [telemetryBusy, setTelemetryBusy] = useState(false);
  const [telemetryLog, setTelemetryLog] = useState([
    {
      id: 'ready',
      tone: 'neutral',
      text: '[SYS] SYZMEKU-API online. Awaiting secure connection handshake.',
    },
  ]);
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

  const appendTelemetry = (entry) => {
    setTelemetryLog((current) => [
      ...current.slice(-7),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tone: 'neutral',
        ...entry,
      },
    ]);
  };

  const verifyLineageToken = () => {
    trackClick('lineage-auth-handshake', { module: 'public-gateway' });
    appendTelemetry({
      tone: lineageToken.trim() ? 'success' : 'warning',
      text: lineageToken.trim()
        ? '[AUTH] Token sequence captured. Continue through secure login for validation.'
        : '[AUTH] Enter a lineage token or continue through secure account access.',
    });
  };

  const engageMentorEngine = async () => {
    const prompt = mentorQuery.trim();
    if (!prompt || telemetryBusy) return;

    trackClick('public-mentor-handshake', { module: 'public-gateway' });
    const startedAt = performance.now();
    setTelemetryBusy(true);
    appendTelemetry({ tone: 'gold', text: '[SYS] Transmitting telemetry packet to mentor engine...' });

    try {
      const response = await fetch(`${PUBLIC_API_BASE}/api/ai/public/intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Public portal mentor inquiry. Respond with concise self-mastery guidance, no diagnosis. Inquiry: ${prompt}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const duration = Math.round(performance.now() - startedAt);

      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || 'Mentor engine returned an unavailable state.');
      }

      appendTelemetry({
        tone: 'success',
        text: `[SYS] Response received in ${duration}ms via ${data.provider || 'gemini'} ${data.model || 'matrix'}.`,
      });
      appendTelemetry({
        tone: 'mentor',
        text: data.response || 'Mentor response returned without readable text.',
      });
      setMentorQuery('');
    } catch (error) {
      appendTelemetry({
        tone: 'error',
        text: `[ERR] Handshake failed: ${error?.message || 'Client-side bypass engaged.'}`,
      });
    } finally {
      setTelemetryBusy(false);
    }
  };

  const handleMentorKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      engageMentorEngine();
    }
  };

  return (
    <main className="entry-shell">
      <section className="welcome-panel">
        <p className="auth-eyebrow">Public gateway: toisouljahacademy.com</p>
        <h1>T.O.T. Soulyah Academy</h1>
        <p className="welcome-powered">Ancestral Intelligence Mentor Platform</p>
        <p className="welcome-copy">
          Reconstruct trauma, reclaim sovereign identity, and activate inner mastery through breath, bodywork,
          sacred coaching, and AI-guided flame mentorship.
        </p>

        <div className="welcome-portal-map" aria-label="Portal architecture">
          <article>
            <span>01</span>
            <strong>Lineage Authentication</strong>
            <p>Secure access, token validation, and private session continuity.</p>
            <div className="welcome-node-control">
              <input
                type="password"
                value={lineageToken}
                onChange={(event) => setLineageToken(event.target.value)}
                placeholder="Enter access token..."
                autoComplete="off"
              />
              <button type="button" className="prism-node-button" onClick={verifyLineageToken}>
                Validate
              </button>
            </div>
          </article>
          <article>
            <span>02</span>
            <strong>Ancestral Mentor Engine</strong>
            <p>Live interaction node for reflection, remembrance, and next-step guidance.</p>
            <div className="welcome-node-control">
              <input
                type="text"
                value={mentorQuery}
                onChange={(event) => setMentorQuery(event.target.value)}
                onKeyDown={handleMentorKeyDown}
                placeholder="Formulate inquiry..."
              />
              <button type="button" className="prism-node-button" onClick={engageMentorEngine} disabled={telemetryBusy || !mentorQuery.trim()}>
                {telemetryBusy ? 'Engaging' : 'Engage'}
              </button>
            </div>
          </article>
        </div>

        <div className="welcome-telemetry-console" aria-live="polite">
          {telemetryLog.map((entry) => (
            <p key={entry.id} className={`telemetry-line telemetry-line--${entry.tone}`}>
              {entry.text}
            </p>
          ))}
        </div>

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
          View the mentor blueprint
        </button>
      </section>

      {showInfo && (
        <div className="welcome-info-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-info-title">
          <section className="welcome-info-panel">
            <button type="button" className="welcome-info-close" aria-label="Close information panel" onClick={closeInfoPanel}>
              &times;
            </button>
            <p className="auth-eyebrow">ARC Codex alignment</p>
            <h2 id="welcome-info-title">How the Mentor Engine Works</h2>
            <div className="welcome-info-grid">
              <article>
                <h3>1. Signal Intake</h3>
                <p>Onboarding captures the current season, support needs, preferred guidance style, and active intention.</p>
              </article>
              <article>
                <h3>2. Pattern Reflection</h3>
                <p>The engine organizes emotional, lineage, and behavioral signals into clear prompts for daily integration.</p>
              </article>
              <article>
                <h3>3. Adaptive Mentorship</h3>
                <p>Session interaction tunes focus, prompt density, and guidance depth in real time.</p>
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
