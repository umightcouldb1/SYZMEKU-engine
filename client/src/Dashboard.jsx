import React, { useState } from 'react';
import axios from 'axios';
import './dashboard.css';

const ANALYSIS_SECTIONS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];
const UNKNOWN_COMMAND_MESSAGE =
  'Unknown command. Supported commands: analyze, log signal, create system, show signals, show systems.';

const parseValue = (value) => {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
};

const parseSignalPayload = (rawText) => {
  const payload = {};
  const tokens = rawText.trim().split(/\s+/).filter(Boolean);
  let currentKey = '';

  tokens.forEach((token) => {
    if (token.includes('=')) {
      const [rawKey, ...rawValueParts] = token.split('=');
      const key = rawKey.trim();
      const value = rawValueParts.join('=').trim();

      if (!key) {
        return;
      }

      currentKey = key;
      payload[key] = parseValue(value);
      return;
    }

    if (currentKey) {
      payload[currentKey] = `${payload[currentKey]} ${token}`.trim();
    }
  });

  return payload;
};

const Dashboard = ({ user }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [outputMode, setOutputMode] = useState('analyze');
  const [outputTitle, setOutputTitle] = useState('TACTICAL READOUT');
  const [error, setError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);

  const submitCommand = async () => {
    if (loading || !command.trim()) {
      return;
    }

    const rawCommand = command.trim();
    const lowered = rawCommand.toLowerCase();

    setLoading(true);
    setError('');

    try {
      if (lowered.startsWith('analyze')) {
        const text = rawCommand.slice(7).trim();

        if (!text) {
          throw new Error('Usage: analyze <text>');
        }

        const { data } = await axios.post('/api/core/analyze', { text });
        setOutputMode('analyze');
        setOutputTitle('TACTICAL READOUT');
        setResult(data);
      } else if (lowered.startsWith('log signal')) {
        const signalText = rawCommand.slice(10).trim();

        if (!signalText || !signalText.includes('=')) {
          throw new Error('Usage: log signal <key=value pairs>');
        }

        const payload = parseSignalPayload(signalText);

        if (!Object.keys(payload).length) {
          throw new Error('Signal payload is empty. Include at least one key=value pair.');
        }

        const { data } = await axios.post('/api/core/signals', payload);
        setOutputMode('entity');
        setOutputTitle('SIGNAL LOGGED');
        setResult({
          message: 'Signal entry recorded successfully.',
          payload: data,
        });
      } else if (lowered.startsWith('create system')) {
        const name = rawCommand.slice(13).trim();

        if (!name) {
          throw new Error('Usage: create system <name>');
        }

        const { data } = await axios.post('/api/core/systems', {
          name,
          purpose: '',
          inputs: [],
          outputs: [],
          routines: [],
        });

        setOutputMode('entity');
        setOutputTitle('SYSTEM CREATED');
        setResult({
          message: 'System record created successfully.',
          payload: data,
        });
      } else if (lowered === 'show signals') {
        const { data } = await axios.get('/api/core/signals');
        setOutputMode('list');
        setOutputTitle('SIGNAL REGISTRY');
        setResult(Array.isArray(data) ? data : []);
      } else if (lowered === 'show systems') {
        const { data } = await axios.get('/api/core/systems');
        setOutputMode('list');
        setOutputTitle('SYSTEM REGISTRY');
        setResult(Array.isArray(data) ? data : []);
      } else {
        throw new Error(UNKNOWN_COMMAND_MESSAGE);
      }

      setShowOverlay(true);
      setCommand('');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Command execution failed.';
      setError(message);
      setOutputMode('error');
      setOutputTitle('TACTICAL READOUT');
      setResult({ message });
      setShowOverlay(true);
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
              <p style={{ margin: 0, fontSize: '0.74rem', letterSpacing: '0.12em', opacity: 0.84 }}>{outputTitle}</p>
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

            {outputMode === 'analyze' &&
              ANALYSIS_SECTIONS.map((section) => {
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

            {outputMode === 'list' && (
              <div>
                {!result.length && <p style={{ margin: 0, fontSize: '0.84rem' }}>&gt; No records found.</p>}
                {result.map((item, index) => (
                  <div
                    key={item._id || index}
                    style={{
                      marginBottom: '0.5rem',
                      border: '1px solid rgba(120, 180, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '0.45rem 0.55rem',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.8 }}>#{index + 1}</p>
                    <pre
                      style={{
                        margin: '0.15rem 0 0',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '0.77rem',
                        lineHeight: 1.35,
                        fontFamily: 'monospace',
                      }}
                    >
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {outputMode === 'entity' && (
              <div>
                <p style={{ margin: '0 0 0.45rem', fontSize: '0.82rem', opacity: 0.92 }}>&gt; {result.message}</p>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.77rem',
                    lineHeight: 1.35,
                    fontFamily: 'monospace',
                  }}
                >
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </div>
            )}

            {outputMode === 'error' && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.88 }}>&gt; {result.message}</p>
            )}

            {error && outputMode !== 'error' && <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem' }}>&gt; ERROR: {error}</p>}
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
