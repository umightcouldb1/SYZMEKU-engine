import React, { useState } from 'react';
import axios from 'axios';
import './dashboard.css';

const ANALYSIS_SECTIONS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];

const Dashboard = ({ user }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);

  const submitCommand = async () => {
    if (loading || !command.trim()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await axios.post('/api/core/analyze', { text: command });
      setResult(data);
      setShowOverlay(true);
      setCommand('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Analysis transmission failed.');
      setShowOverlay(false);
    } finally {
      setLoading(false);
    }
  };

  const handleInputKeyDown = async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await submitCommand();
    }
  };

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

      <footer className="crystal-footer" style={{ position: 'relative' }}>
        {showOverlay && result && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 12px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(840px, 92vw)',
              maxHeight: '46vh',
              overflowY: 'auto',
              background: 'rgba(8, 14, 28, 0.8)',
              border: '1px solid rgba(120, 180, 255, 0.35)',
              borderRadius: '12px',
              boxShadow: '0 0 22px rgba(61, 142, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              padding: '0.9rem 1rem',
              zIndex: 15,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <p style={{ margin: 0, fontSize: '0.74rem', letterSpacing: '0.12em', opacity: 0.84 }}>TACTICAL READOUT</p>
              <button
                type="button"
                onClick={() => setShowOverlay(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#d6e6ff',
                  borderRadius: '8px',
                  fontSize: '0.68rem',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                }}
              >
                DISMISS
              </button>
            </div>

            {ANALYSIS_SECTIONS.map((section) => {
              const items = Array.isArray(result[section]) ? result[section] : [];
              if (!items.length) {
                return null;
              }

              return (
                <div key={section} style={{ marginBottom: '0.55rem' }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.9 }}>{section.toUpperCase()}</p>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                    {items.map((item, index) => (
                      <li key={`${section}-${index}`} style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {error && <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem' }}>&gt; ERROR: {error}</p>}
          </div>
        )}

        {loading && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '-1.25rem',
              fontSize: '0.68rem',
              letterSpacing: '0.08em',
              opacity: 0.75,
              pointerEvents: 'none',
            }}
          >
            ANALYZING COMMAND...
          </div>
        )}

        {!loading && error && !showOverlay && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '-1.25rem',
              fontSize: '0.68rem',
              opacity: 0.78,
              pointerEvents: 'none',
            }}
          >
            &gt; {error}
          </div>
        )}

        <div className="input-shard">
          <span className="glyph-prompt">✧</span>
          <input
            type="text"
            placeholder="TRANSMIT CODEX OR EPOCH COMMAND..."
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={loading}
          />
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
