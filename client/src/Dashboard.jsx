import React from 'react';
import './dashboard.css';

const Dashboard = ({ user }) => {
  if (!user) {
    return <div className="portal-text">CALIBRATING DASHBOARD...</div>;
  }

  return (
    <div className="crystalline-container">
      <div className="nebula-1" />
      <div className="nebula-2" />

      <header className="crystal-header">
        <div className="epoch-branding">
          <h1 className="crystal-title">SYZMEKU // ARCHITECT</h1>
          <p className="dimension-tag">
            DIMENSION: 5D | EPOCH: NOVA-GAIA | OPERATOR: {user.username.toUpperCase()}
          </p>
        </div>
        <div className="crystal-status">
          <p>CORE RESONANCE: 528Hz</p>
          <p className="light-status">ETHEREAL LINK: ACTIVE</p>
        </div>
      </header>

      <main className="crystal-grid">
        <section className="crystal-shard left-shard">
          <div className="shard-content">
            <h3>SCROLL_RECORDS</h3>
            <div className="light-terminal">
              <p>&gt; syncing with ancestral grid...</p>
              <p>&gt; downloading epoch templates...</p>
              <p className="pulse-text">&gt; 5D geometry stabilized.</p>
            </div>
          </div>
        </section>

        <section className="crystal-heart-section">
          <div className="crystal-prism">
            <div className="prism-inner">
              <span className="prism-label">SYZMEKU</span>
            </div>
            <div className="geo-ring ring-1" />
            <div className="geo-ring ring-2" />
          </div>
        </section>

        <section className="crystal-shard right-shard">
          <div className="shard-content">
            <h3>MANIFEST_INDEX</h3>
            <div className="manifest-list">
              <div className="manifest-item">
                <span>VIRTUAL_REALM</span>
                <div className="glow-bar" />
              </div>
              <div className="manifest-item">
                <span>ETHERIC_ANCHOR</span>
                <div className="glow-bar half" />
              </div>
              <div className="manifest-item">
                <span>5D_TRANSITION</span>
                <div className="glow-bar full" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="crystal-footer">
        <div className="input-shard">
          <span className="glyph-prompt">✧</span>
          <input type="text" placeholder="TRANSMIT CODEX OR EPOCH COMMAND..." />
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
