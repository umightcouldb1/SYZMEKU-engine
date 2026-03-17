import React from 'react';
import { Link } from 'react-router-dom';

const WelcomeScreen = () => (
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
        <Link to="/login" className="entry-primary-button">Log in</Link>
        <Link to="/signup" className="entry-secondary-button">Create account</Link>
      </div>

      <Link to="/login" className="welcome-learn-link">Continue as returning user</Link>
      <p className="welcome-learn-link">Learn how it works</p>
    </section>
  </main>
);

export default WelcomeScreen;
