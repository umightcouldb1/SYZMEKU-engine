import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './dashboard.css';

const ANALYSIS_SECTIONS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];
const SESSION_MEMORY_KEY = 'syzmeku.sessionMemory';
const MAX_COMMAND_HISTORY = 20;

const HELP_LINES = [
  'analyze <text>',
  'analyze strategic|health|build|signal <text>',
  'recommend | recommend next step | recommend based on current state',
  'log signal sleep=6 stress=3 symptoms=calm',
  'show signals | trend signals | signal anomaly | signal report',
  'create system <name> | show systems | map systems | run system <name>',
  'task create <description> | task show | task complete <id>',
  'save recommendation',
  'plan <goal> | build <goal> | execute <goal>',
  'analyze file | analyze image | voice on | voice off',
  'alerts | monitor state',
  'history | context | clear | help',
];

const DEFAULT_SESSION_MEMORY = {
  recentCommands: [],
  lastOverlayResult: null,
  activeRouteType: 'analyze',
};

const parseValue = (value) => (/^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value);

const parseSignalPayload = (rawText) => {
  const payload = {};
  const tokens = rawText.trim().split(/\s+/).filter(Boolean);
  let currentKey = '';

  tokens.forEach((token) => {
    if (token.includes('=')) {
      const [rawKey, ...rawValueParts] = token.split('=');
      const key = rawKey.trim();
      const value = rawValueParts.join('=').trim();
      if (!key) return;
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

const formatRecordedAt = (value) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
};

const modeFromCommand = (commandText) => {
  const lowered = commandText.toLowerCase();
  if (lowered.startsWith('analyze strategic')) return 'STRATEGIC';
  if (lowered.startsWith('analyze health')) return 'HEALTH';
  if (lowered.startsWith('analyze build')) return 'BUILD';
  if (lowered.startsWith('analyze signal')) return 'SIGNAL';
  if (lowered.startsWith('recommend')) return 'RECOMMEND';
  return 'GENERAL';
};

const renderTaskCard = (task, keyPrefix = 'task') => (
  <div key={keyPrefix} style={{ marginBottom: '0.5rem', border: '1px solid rgba(120, 180, 255, 0.2)', borderRadius: '8px', padding: '0.45rem 0.55rem' }}>
    <p style={{ margin: '0.12rem 0', fontSize: '0.83rem' }}><strong>ID:</strong> {task?._id || 'unknown'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.83rem' }}><strong>Description:</strong> {task?.description || '(empty)'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.83rem' }}><strong>Status:</strong> {task?.status || 'open'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.83rem' }}><strong>Source:</strong> {task?.source || '-'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.77rem', opacity: 0.84 }}><strong>Created:</strong> {formatRecordedAt(task?.createdAt)}</p>
    {task?.completedAt && <p style={{ margin: '0.12rem 0', fontSize: '0.77rem', opacity: 0.84 }}><strong>Completed:</strong> {formatRecordedAt(task?.completedAt)}</p>}
  </div>
);

const renderSystemCard = (item, key) => (
  <div key={key} style={{ marginBottom: '0.5rem', border: '1px solid rgba(120, 180, 255, 0.2)', borderRadius: '8px', padding: '0.45rem 0.55rem' }}>
    <p style={{ margin: '0.12rem 0', fontSize: '0.85rem' }}><strong>{item?.name || 'Unnamed System'}</strong></p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Purpose: {item?.purpose || '-'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Type: {item?.protocolType || 'generic'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Inputs: {(item?.inputs || []).join(', ') || 'none'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Outputs: {(item?.outputs || []).join(', ') || 'none'}</p>
    <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Routines: {(item?.routines || []).join(', ') || 'none'}</p>
    {item?.relatedSignals && <p style={{ margin: '0.12rem 0', fontSize: '0.8rem' }}>Related signals: {item.relatedSignals.length}</p>}
  </div>
);

const Dashboard = ({ user }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [outputMode, setOutputMode] = useState('analyze');
  const [outputTitle, setOutputTitle] = useState('TACTICAL READOUT');
  const [commandLabel, setCommandLabel] = useState('analyze');
  const [routeLabel, setRouteLabel] = useState('analyze');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [activeRouteType, setActiveRouteType] = useState(DEFAULT_SESSION_MEMORY.activeRouteType);
  const [lastOverlayResult, setLastOverlayResult] = useState(DEFAULT_SESSION_MEMORY.lastOverlayResult);
  const [voiceActive, setVoiceActive] = useState(false);
  const [uploadedFileText, setUploadedFileText] = useState('');
  const [uploadedImageInfo, setUploadedImageInfo] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    try {
      const parsedSessionMemory = JSON.parse(localStorage.getItem(SESSION_MEMORY_KEY) || 'null');
      if (parsedSessionMemory && typeof parsedSessionMemory === 'object') {
        const recentCommands = Array.isArray(parsedSessionMemory.recentCommands)
          ? parsedSessionMemory.recentCommands.slice(0, MAX_COMMAND_HISTORY)
          : [];
        setCommandHistory(recentCommands);
        setActiveRouteType(typeof parsedSessionMemory.activeRouteType === 'string' ? parsedSessionMemory.activeRouteType : DEFAULT_SESSION_MEMORY.activeRouteType);
        setLastOverlayResult(parsedSessionMemory.lastOverlayResult || null);
      }
    } catch {
      setCommandHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SESSION_MEMORY_KEY, JSON.stringify({ recentCommands: commandHistory, lastOverlayResult, activeRouteType }));
  }, [commandHistory, lastOverlayResult, activeRouteType]);

  const addCommandToHistory = (rawCommand) => {
    setCommandHistory((prev) => [rawCommand, ...prev.filter((entry) => entry.toLowerCase() !== rawCommand.toLowerCase())].slice(0, MAX_COMMAND_HISTORY));
    setHistoryIndex(-1);
  };

  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Speech recognition not supported in this browser.');
      return;
    }
    if (!recognitionRef.current) {
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) setCommand(transcript);
      };
      recognition.onend = () => setVoiceActive(false);
      recognition.onerror = () => setVoiceActive(false);
      recognitionRef.current = recognition;
    }
    setVoiceActive(true);
    recognitionRef.current.start();
  };

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setVoiceActive(false);
  };

  const sessionContext = useMemo(
    () => ({ recentCommands: commandHistory, lastOverlayResult, activeRouteType }),
    [commandHistory, lastOverlayResult, activeRouteType]
  );

  const submitCommand = async () => {
    if (loading || !command.trim()) return;
    const rawCommand = command.trim();
    const lowered = rawCommand.toLowerCase();

    setLoading(true);
    setError('');
    setCommandLabel(rawCommand);

    const contextPayload = {
      text: rawCommand.replace(/^analyze\s+/i, '').trim(),
      context: sessionContext,
    };

    const runLocal = (title, mode, payload, route) => {
      setOutputTitle(title);
      setOutputMode(mode);
      setRouteLabel(route);
      setResult(payload);
      setShowOverlay(true);
      addCommandToHistory(rawCommand);
      setActiveRouteType(route);
      setLastOverlayResult(payload);
      setCommand('');
      setLoading(false);
    };

    try {
      if (lowered === 'help') return runLocal('COMMAND REFERENCE', 'help', { lines: HELP_LINES }, 'help');
      if (lowered === 'history') return runLocal('COMMAND HISTORY', 'history', { commands: commandHistory }, 'history');
      if (lowered === 'context') return runLocal('SESSION CONTEXT', 'context', { activeRoute: activeRouteType, savedRecentCommands: commandHistory.length, hasLastResult: Boolean(lastOverlayResult) }, 'context');
      if (lowered === 'clear') return runLocal('CONSOLE CLEARED', 'context', { activeRoute: 'clear', savedRecentCommands: 0, hasLastResult: false }, 'clear');
      if (lowered === 'voice on') return runLocal('VOICE CONTROL', 'context', { message: 'VOICE: ACTIVE' }, 'voice on') && startVoice();
      if (lowered === 'voice off') return runLocal('VOICE CONTROL', 'context', { message: 'VOICE: OFF' }, 'voice off') && stopVoice();

      let response;
      if (lowered.startsWith('analyze ')) {
        setOutputTitle(lowered.startsWith('analyze image') ? 'IMAGE ANALYSIS' : lowered.startsWith('analyze file') ? 'FILE ANALYSIS' : 'TACTICAL READOUT');
        setRouteLabel('analyze');
        response = await axios.post('/api/core/analyze', {
          ...contextPayload,
          text: lowered === 'analyze file' ? uploadedFileText || 'No file text loaded.' : lowered === 'analyze image' ? uploadedImageInfo || 'No image loaded.' : rawCommand.slice(8).trim(),
        });
        setOutputMode('analyze');
      } else if (lowered === 'recommend' || lowered.startsWith('recommend ')) {
        setOutputTitle('RECOMMENDATION ENGINE');
        setRouteLabel('recommend');
        response = await axios.post('/api/core/recommend', { text: rawCommand.length > 9 ? rawCommand.slice(9).trim() : 'based on current state', context: sessionContext });
        setOutputMode('analyze');
      } else if (lowered === 'show signals') {
        setOutputTitle('SIGNAL LOG');
        setRouteLabel('show signals');
        response = await axios.get('/api/core/signals');
        setOutputMode('signals');
      } else if (lowered === 'trend signals') {
        setOutputTitle('SIGNAL TRENDS');
        setRouteLabel('trend signals');
        response = await axios.get('/api/core/signals/trends');
        setOutputMode('signal-trends');
      } else if (lowered === 'signal anomaly') {
        setOutputTitle('SIGNAL ANOMALY');
        setRouteLabel('signal anomaly');
        response = await axios.get('/api/core/signals/anomalies');
        setOutputMode('signal-anomaly');
      } else if (lowered === 'signal report') {
        setOutputTitle('SIGNAL REPORT');
        setRouteLabel('signal report');
        response = await axios.get('/api/core/signals/report');
        setOutputMode('analyze');
      } else if (lowered.startsWith('log signal ')) {
        setOutputTitle('SIGNAL RECORDED');
        setRouteLabel('log signal');
        response = await axios.post('/api/core/signals', parseSignalPayload(rawCommand.slice(11).trim()));
        setOutputMode('signals');
      } else if (lowered === 'show systems') {
        setOutputTitle('SYSTEM REGISTRY');
        setRouteLabel('show systems');
        response = await axios.get('/api/core/systems');
        setOutputMode('systems');
      } else if (lowered === 'map systems') {
        setOutputTitle('SYSTEM MAP');
        setRouteLabel('map systems');
        response = await axios.get('/api/core/systems/map');
        setOutputMode('system-map');
      } else if (lowered.startsWith('create system ')) {
        setOutputTitle('SYSTEM CREATED');
        setRouteLabel('create system');
        response = await axios.post('/api/core/systems', { name: rawCommand.slice(14).trim(), purpose: '', inputs: [], outputs: [], routines: [] });
        setOutputMode('systems');
      } else if (lowered.startsWith('run system ')) {
        setOutputTitle('SYSTEM PROTOCOL');
        setRouteLabel('run system');
        response = await axios.post('/api/core/systems/run', { name: rawCommand.slice(11).trim() });
        setOutputMode('analyze');
      } else if (lowered.startsWith('task create ')) {
        setOutputTitle('TASK CREATED');
        setRouteLabel('task create');
        response = await axios.post('/api/core/tasks', { description: rawCommand.slice(12).trim() });
        setOutputMode('task-card');
      } else if (lowered === 'task show') {
        setOutputTitle('TASK LIST');
        setRouteLabel('task show');
        response = await axios.get('/api/core/tasks');
        setOutputMode('tasks');
      } else if (lowered.startsWith('task complete ')) {
        setOutputTitle('TASK COMPLETED');
        setRouteLabel('task complete');
        response = await axios.post(`/api/core/tasks/${rawCommand.slice(14).trim()}/complete`);
        setOutputMode('task-card');
      } else if (lowered === 'save recommendation') {
        const nextActions = Array.isArray(lastOverlayResult?.next_actions) ? lastOverlayResult.next_actions : [];
        setOutputTitle('RECOMMENDATION SAVED');
        setRouteLabel('save recommendation');
        response = await axios.post('/api/core/tasks/save-recommendation', { nextActions });
        setOutputMode('tasks');
      } else if (lowered.startsWith('plan ') || lowered.startsWith('build ') || lowered.startsWith('execute ')) {
        const goal = rawCommand.split(/\s+/).slice(1).join(' ').trim();
        setOutputTitle(lowered.startsWith('plan ') ? 'STRATEGIC PLAN' : lowered.startsWith('build ') ? 'BUILD PLAN' : 'EXECUTION PLAN');
        setRouteLabel(lowered.startsWith('plan ') ? 'plan' : lowered.startsWith('build ') ? 'build' : 'execute');
        response = await axios.post('/api/core/analyze', { text: `strategic goal: ${goal}`, context: sessionContext });
        if (lowered.startsWith('execute ') && Array.isArray(response?.data?.next_actions)) {
          await axios.post('/api/core/tasks/save-recommendation', { nextActions: response.data.next_actions });
        }
        setOutputMode('analyze');
      } else if (lowered === 'alerts' || lowered === 'monitor state') {
        setOutputTitle(lowered === 'alerts' ? 'SYSTEM ALERTS' : 'STATE MONITOR');
        setRouteLabel(lowered);
        response = await axios.get('/api/core/alerts');
        setOutputMode('alerts');
      } else {
        runLocal('COMMAND ERROR', 'error', { message: 'Unknown command. Type help.' }, 'unknown');
        return;
      }

      const data = response?.data;
      setResult(data);
      setShowOverlay(true);
      addCommandToHistory(rawCommand);
      setActiveRouteType(routeLabel || rawCommand.split(' ')[0]);
      setLastOverlayResult(data);
      setCommand('');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Command execution failed.';
      setError(message);
      setOutputMode('error');
      setOutputTitle('COMMAND ERROR');
      setRouteLabel('error');
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
      if (!commandHistory.length) return;
      const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(commandHistory[nextIndex]);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!commandHistory.length || historyIndex < 0) return;
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

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadedFileText(text.slice(0, 4000));
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadedImageInfo(`Image: ${file.name}, ${Math.round(file.size / 1024)}KB, type=${file.type}`);
  };

  if (!user) return <div className="portal-text">CALIBRATING DASHBOARD...</div>;

  return (
    <div className="crystalline-container">
      <div className="nebula-1" />
      <div className="nebula-2" />
      <header className="crystal-header">
        <div className="epoch-branding">
          <h1 className="crystal-title">SYZMEKU // ARCHITECT</h1>
          <p className="dimension-tag">DIMENSION: 5D | EPOCH: NOVA-GAIA | OPERATOR: {user.username.toUpperCase()}</p>
        </div>
        <div className="crystal-status">
          <p>CORE RESONANCE: 528Hz</p>
          <p className="light-status">VOICE: {voiceActive ? 'ACTIVE' : 'OFF'}</p>
          <p className="light-status">MEMORY: ACTIVE | ROUTE: {routeLabel} | CONTEXT: LOADED</p>
          <p className="light-status">MODE: {modeFromCommand(commandLabel)}</p>
        </div>
      </header>

      <main className="crystal-grid"><section className="crystal-heart-section"><div className="crystal-prism"><div className="prism-inner"><span className="prism-label">SYZMEKU</span></div><div className="geo-ring ring-1" /><div className="geo-ring ring-2" /></div></section></main>

      <footer className="crystal-footer" style={{ position: 'relative' }}>
        {showOverlay && result && (
          <div style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)', width: 'min(840px, 92vw)', maxHeight: '46vh', overflowY: 'auto', background: 'rgba(8, 14, 28, 0.8)', border: '1px solid rgba(120, 180, 255, 0.35)', borderRadius: '12px', boxShadow: '0 0 22px rgba(61, 142, 255, 0.2)', backdropFilter: 'blur(10px)', padding: '0.9rem 1rem', zIndex: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}><p style={{ margin: 0, fontSize: '0.74rem', letterSpacing: '0.12em', opacity: 0.84 }}>{outputTitle}</p><button type="button" onClick={() => setShowOverlay(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#d6e6ff', borderRadius: '8px', fontSize: '0.68rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}>DISMISS</button></div>
            <div style={{ margin: '0 0 0.6rem', fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.9 }}><p style={{ margin: 0 }}>&gt; COMMAND: {commandLabel}</p><p style={{ margin: 0 }}>&gt; ROUTE: {routeLabel}</p></div>

            {outputMode === 'analyze' && (<div><p style={{ margin: '0.2rem 0', fontWeight: 600 }}>Summary: {(result?.objectives || [])[0] || 'No summary available.'}</p>{ANALYSIS_SECTIONS.map((section) => <div key={section} style={{ marginBottom: '0.55rem' }}><p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.9 }}>{section.toUpperCase()}</p><ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>{(Array.isArray(result?.[section]) ? result[section] : []).map((item, index) => <li key={`${section}-${index}`} style={{ fontSize: '0.84rem', lineHeight: 1.45 }}>{item}</li>)}</ul></div>)}</div>)}
            {outputMode === 'signals' && <div>{(Array.isArray(result) ? result : []).map((item, index) => <div key={index} style={{ marginBottom: '0.4rem', fontSize: '0.82rem' }}>Sleep {item?.sleep ?? 'n/a'} | Stress {item?.stress ?? 'n/a'} | Symptoms {item?.symptoms || '-'} | {formatRecordedAt(item?.createdAt)}</div>)}</div>}
            {outputMode === 'systems' && <div>{(Array.isArray(result) ? result : []).map((item, i) => renderSystemCard(item, `sys-${i}`))}</div>}
            {outputMode === 'system-map' && <div>{(result?.systems || []).map((item, i) => renderSystemCard(item, `map-${i}`))}</div>}
            {outputMode === 'tasks' && <div>{((result?.tasks || result || [])).map((task, i) => renderTaskCard(task, `task-${i}`))}</div>}
            {outputMode === 'task-card' && renderTaskCard(result, 'single-task')}
            {outputMode === 'signal-trends' && <div><p>Sleep: {result?.sleep?.state}</p><p>Stress: {result?.stress?.state}</p><p>Symptoms: {result?.symptoms?.state}</p></div>}
            {outputMode === 'signal-anomaly' && <div>{(result?.anomalies || []).map((a) => <p key={a}>{a}</p>)}</div>}
            {outputMode === 'alerts' && <div>{(result?.alerts || []).map((a, i) => <p key={`${a.type}-${i}`}>{a.severity.toUpperCase()}: {a.message}</p>)}</div>}
            {outputMode === 'help' && (result?.lines || []).map((line) => <p key={line}>{line}</p>)}
            {outputMode === 'history' && (result?.commands || []).map((line, i) => <p key={`${line}-${i}`}>{i + 1}. {line}</p>)}
            {outputMode === 'context' && <p>{result?.message || `active=${result?.activeRoute}`}</p>}
            {outputMode === 'error' && <p>&gt; {result?.message}</p>}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input type="file" onChange={handleFileUpload} style={{ fontSize: '0.72rem' }} />
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ fontSize: '0.72rem' }} />
          <button type="button" onClick={voiceActive ? stopVoice : startVoice} style={{ fontSize: '0.7rem' }}>{voiceActive ? 'MIC OFF' : 'MIC ON'}</button>
        </div>

        <div className="input-shard">
          <span className="glyph-prompt">✧</span>
          <input type="text" placeholder="TRANSMIT CODEX OR EPOCH COMMAND..." value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={handleInputKeyDown} disabled={loading} />
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
