import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './dashboard.css';

const ANALYSIS_SECTIONS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];
const HELP_LINES = [
  'Supported commands:',
  '• analyze <text>',
  '• show signals',
  '• show systems',
  '• create system <name>',
  '• log signal key=value key=value',
  '• help',
];
const UNKNOWN_COMMAND_MESSAGE =
  'Unknown command. Type help to view supported commands.';
const COMMAND_HISTORY_KEY = 'syzmeku.commandHistory';
const MAX_COMMAND_HISTORY = 20;

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
      payload[currentKey] = parseValue(`${payload[currentKey]} ${token}`.trim());
    }
  });

  return payload;
};

const getCommandRoute = (rawCommand) => {
  const trimmed = rawCommand.trim();
  const lowered = trimmed.toLowerCase();

  if (lowered.startsWith('analyze ')) {
    return {
      type: 'analyze',
      routeLabel: 'analyze',
      title: 'TACTICAL READOUT',
      request: () => axios.post('/api/core/analyze', { text: trimmed.slice(8).trim() }),
    };
  }

  if (lowered === 'show signals') {
    return {
      type: 'show-signals',
      routeLabel: 'show signals',
      title: 'SIGNAL LOG',
      request: () => axios.get('/api/core/signals'),
    };
  }

  if (lowered === 'show systems') {
    return {
      type: 'show-systems',
      routeLabel: 'show systems',
      title: 'SYSTEM REGISTRY',
      request: () => axios.get('/api/core/systems'),
    };
  }

  if (lowered.startsWith('create system ')) {
    const name = trimmed.slice(14).trim();

    return {
      type: 'create-system',
      routeLabel: 'create system',
      title: 'SYSTEM CREATED',
      request: () =>
        axios.post('/api/core/systems', {
          name,
          purpose: '',
          inputs: [],
          outputs: [],
          routines: [],
        }),
    };
  }

  if (lowered.startsWith('log signal ')) {
    const signalText = trimmed.slice(11).trim();

    return {
      type: 'log-signal',
      routeLabel: 'log signal',
      title: 'SIGNAL RECORDED',
      request: () => axios.post('/api/core/signals', parseSignalPayload(signalText)),
    };
  }

  if (lowered === 'help') {
    return {
      type: 'help',
      routeLabel: 'help',
      title: 'COMMAND REFERENCE',
      request: null,
    };
  }

  return {
    type: 'unknown',
    routeLabel: 'unknown',
    title: 'COMMAND ERROR',
    request: null,
  };
};

const renderCompactJson = (data, keyPrefix = 'json') => (
  <div
    key={keyPrefix}
    style={{
      marginBottom: '0.5rem',
      border: '1px solid rgba(120, 180, 255, 0.2)',
      borderRadius: '8px',
      padding: '0.45rem 0.55rem',
    }}
  >
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
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

const Dashboard = ({ user }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [outputMode, setOutputMode] = useState('analyze');
  const [outputTitle, setOutputTitle] = useState('TACTICAL READOUT');
  const [routeLabel, setRouteLabel] = useState('analyze');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    try {
      const rawHistory = localStorage.getItem(COMMAND_HISTORY_KEY);
      const parsedHistory = JSON.parse(rawHistory || '[]');
      if (Array.isArray(parsedHistory)) {
        setCommandHistory(parsedHistory.slice(0, MAX_COMMAND_HISTORY));
      }
    } catch {
      setCommandHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(commandHistory));
  }, [commandHistory]);

  const addCommandToHistory = (rawCommand) => {
    setCommandHistory((previous) => {
      const updated = [
        rawCommand,
        ...previous.filter((entry) => entry.toLowerCase() !== rawCommand.toLowerCase()),
      ];

      return updated.slice(0, MAX_COMMAND_HISTORY);
    });
    setHistoryIndex(-1);
  };

  const submitCommand = async () => {
    if (loading || !command.trim()) {
      return;
    }

    const rawCommand = command.trim();
    const route = getCommandRoute(rawCommand);

    setLoading(true);
    setError('');
    setOutputTitle(route.title);
    setRouteLabel(route.routeLabel);

    if (route.type === 'unknown') {
      setOutputMode('unknown');
      setResult({ message: UNKNOWN_COMMAND_MESSAGE });
      setShowOverlay(true);
      setLoading(false);
      return;
    }

    if (route.type === 'help') {
      setOutputMode('help');
      setResult({ lines: HELP_LINES });
      setShowOverlay(true);
      addCommandToHistory(rawCommand);
      setCommand('');
      setLoading(false);
      return;
    }

    try {
      const response = await route.request();
      const data = response?.data;

      if (route.type === 'analyze') {
        setOutputMode('analyze');
        setResult(data);
      } else if (route.type === 'show-signals') {
        setOutputMode('signals');
        setResult(Array.isArray(data) ? data : []);
      } else if (route.type === 'show-systems') {
        setOutputMode('systems');
        setResult(Array.isArray(data) ? data : []);
      } else if (route.type === 'create-system') {
        setOutputMode('created');
        setResult(data);
      } else if (route.type === 'log-signal') {
        setOutputMode('logged');
        setResult(data);
      }

      setShowOverlay(true);
      addCommandToHistory(rawCommand);
      setCommand('');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Command execution failed.';
      setError(message);
      setOutputMode('error');
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
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!commandHistory.length) {
        return;
      }

      const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(commandHistory[nextIndex]);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!commandHistory.length || historyIndex < 0) {
        return;
      }

      const nextIndex = historyIndex - 1;

      if (nextIndex < 0) {
        setHistoryIndex(-1);
        setCommand('');
        return;
      }

      setHistoryIndex(nextIndex);
      setCommand(commandHistory[nextIndex]);
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

            <p style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.9 }}>
              ROUTE: {routeLabel}
            </p>

            {outputMode === 'analyze' &&
              ANALYSIS_SECTIONS.map((section) => {
                const items = Array.isArray(result?.[section]) ? result[section] : [];

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

            {outputMode === 'signals' && (
              <div>
                {!result.length && <p style={{ margin: 0, fontSize: '0.84rem' }}>No signals recorded yet.</p>}
                {result.map((item, index) => renderCompactJson(item, `signal-${item?._id || index}`))}
              </div>
            )}

            {outputMode === 'systems' && (
              <div>
                {!result.length && <p style={{ margin: 0, fontSize: '0.84rem' }}>No systems created yet.</p>}
                {result.map((item, index) => renderCompactJson(item, `system-${item?._id || index}`))}
              </div>
            )}

            {(outputMode === 'created' || outputMode === 'logged') && renderCompactJson(result)}

            {outputMode === 'unknown' && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.88 }}>{result.message}</p>
            )}

            {outputMode === 'help' && (
              <div>
                {(result?.lines || []).map((line) => (
                  <p key={line} style={{ margin: '0.18rem 0', fontSize: '0.82rem', opacity: 0.88 }}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            {outputMode === 'error' && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.88 }}>&gt; {result.message}</p>
            )}
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
            ROUTING COMMAND...
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
