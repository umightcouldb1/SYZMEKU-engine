import React from 'react';
import { useNavigate } from 'react-router-dom';

const clearStaleAuthState = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const WelcomeScreen = () => {
  const navigate = useNavigate();

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
        <p className="welcome-learn-link">Learn how it works</p>
      </section>
    </main>
  );
};

export default WelcomeScreen;
