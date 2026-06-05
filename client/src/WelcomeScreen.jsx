import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './interactionEnhancements.css';

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);

  const startAuthFlow = (path) => {
    clearStaleAuthState();
    navigate(path, { replace: true });
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
        <button type="button" className="welcome-learn-link welcome-text-button" onClick={() => setShowInfo(true)}>
          Learn how it works
        </button>
      </section>

      {showInfo && (
        <div className="welcome-info-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-info-title">
          <section className="welcome-info-panel">
            <button type="button" className="welcome-info-close" aria-label="Close information panel" onClick={() => setShowInfo(false)}>
              ×
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
                <p>Your profile persists so Big SYZ can keep its tone, context, and next steps aligned as you move.</p>
              </article>
            </div>
            <div className="welcome-info-actions">
              <button type="button" className="entry-secondary-button" onClick={() => setShowInfo(false)}>
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
