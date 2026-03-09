import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './dashboard.css';

const ANALYSIS_SECTIONS = ['objectives', 'constraints', 'risks', 'leverage', 'next_actions'];
const SESSION_MEMORY_KEY = 'syzmeku.sessionMemory';
const MAX_COMMAND_HISTORY = 20;

const HELP_LINES = [
  'analyze <text>',
  'analyze strategic|health|build|signal <text>',
  'recommend | recommend based on current state | summary',
  'log signal sleep=6 stress=3 symptoms=calm',
  'show signals | trend signals | signal anomaly | signal report',
  'create system <name> | show systems | map systems | run system <name>',
  'automate system <name> | disable system <name> | protocol status',
  'task create <description> | task show | task complete <id> | save recommendation',
  'memory save <text> | memory show | memory search <query> | history | context',
  'agent <goal> | execute <goal> | orchestrate <goal> | plan <goal> | build <goal>',
  'mentor <text> | reflect <text> | reframe <text>',
  'monitor run | alerts | autonomy status',
  'loop start',
  'loop stop',
  'loop status',
  'analyze file | analyze image | voice on | voice off | clear | help',
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

    if (currentKey) payload[currentKey] = parseValue(`${payload[currentKey]} ${token}`.trim());
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
  if (lowered.startsWith('agent')) return 'AGENT';
  if (lowered.startsWith('execute')) return 'EXECUTION';
  if (lowered.startsWith('orchestrate')) return 'ORCHESTRATION';
  if (lowered.startsWith('mentor')) return 'MENTOR';
  if (lowered.startsWith('reflect')) return 'REFLECTION';
  if (lowered.startsWith('reframe')) return 'REFRAME';
  return 'GENERAL';
};

const Dashboard = ({ user }) => {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [outputMode, setOutputMode] = useState('analyze');
  const [outputTitle, setOutputTitle] = useState('TACTICAL READOUT');
  const [commandLabel, setCommandLabel] = useState('analyze');
  const [routeLabel, setRouteLabel] = useState('analyze');
  const [result, setResult] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [activeRouteType, setActiveRouteType] = useState(DEFAULT_SESSION_MEMORY.activeRouteType);
  const [lastOverlayResult, setLastOverlayResult] = useState(DEFAULT_SESSION_MEMORY.lastOverlayResult);
  const [voiceActive, setVoiceActive] = useState(false);
  const [uploadedFileText, setUploadedFileText] = useState('');
  const [uploadedImageInfo, setUploadedImageInfo] = useState('');
  const [operatorSummary, setOperatorSummary] = useState(null);
  const recognitionRef = useRef(null);

  const saveSessionMemory = useMemo(
    () => (nextMemory) => {
      localStorage.setItem(SESSION_MEMORY_KEY, JSON.stringify(nextMemory));
    },
    []
  );

  const fetchSummary = async () => {
    try {
      const response = await axios.get('/api/core/summary');
      setOperatorSummary(response.data);
    } catch {
      setOperatorSummary(null);
    }
  };

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
      saveSessionMemory(DEFAULT_SESSION_MEMORY);
    }
    fetchSummary();
  }, [saveSessionMemory]);

  const addCommandToHistory = (rawCommand) => {
    const nextHistory = [rawCommand, ...commandHistory.filter((entry) => entry !== rawCommand)].slice(0, MAX_COMMAND_HISTORY);
    setCommandHistory(nextHistory);
    saveSessionMemory({ recentCommands: nextHistory, activeRouteType, lastOverlayResult });
    setHistoryIndex(-1);
  };

  const startVoice = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    if (!recognitionRef.current) {
      const recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) setCommand(transcript);
      };
      recognition.onend = () => setVoiceActive(false);
      recognitionRef.current = recognition;
    }
    recognitionRef.current.start();
    setVoiceActive(true);
  };

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setVoiceActive(false);
  };

  const runLocal = (title, mode, payload, routeType = 'local') => {
    setOutputTitle(title);
    setOutputMode(mode);
    setRouteLabel(routeType);
    setResult(payload);
    setShowOverlay(true);
    setLastOverlayResult(payload);
    setActiveRouteType(routeType);
    saveSessionMemory({ recentCommands: commandHistory, activeRouteType: routeType, lastOverlayResult: payload });
  };

  const submitCommand = async () => {
    const rawCommand = command.trim();
    if (!rawCommand || loading) return;

    const lowered = rawCommand.toLowerCase();
    const sessionContext = {
      recentCommands: commandHistory,
      activeRouteType,
      lastOverlayResult,
    };

    if (lowered === 'help') {
      runLocal('COMMAND SURFACE', 'help', { lines: HELP_LINES }, 'help');
      setCommand('');
      return;
    }
    if (lowered === 'clear') {
      setShowOverlay(false);
      setResult(null);
      setCommand('');
      return;
    }
    if (lowered === 'history') {
      runLocal('COMMAND HISTORY', 'history', { commands: commandHistory }, 'history');
      return;
    }
    if (lowered === 'context') {
      runLocal('SESSION CONTEXT', 'context', { activeRoute: activeRouteType, hasLastOverlay: Boolean(lastOverlayResult) }, 'context');
      return;
    }
    if (lowered === 'voice on') {
      startVoice();
      runLocal('VOICE CHANNEL', 'context', { message: 'Voice capture activated.' }, 'voice on');
      return;
    }
    if (lowered === 'voice off') {
      stopVoice();
      runLocal('VOICE CHANNEL', 'context', { message: 'Voice capture stopped.' }, 'voice off');
      return;
    }

    setLoading(true);
    setCommandLabel(rawCommand);

    try {
      let response;
      let nextRoute = lowered.split(' ')[0];

      if (lowered.startsWith('analyze ')) {
        setOutputTitle(lowered.startsWith('analyze image') ? 'IMAGE ANALYSIS' : lowered.startsWith('analyze file') ? 'FILE ANALYSIS' : 'TACTICAL READOUT');
        nextRoute = 'analyze';
        response = await axios.post('/api/core/analyze', {
          text: lowered === 'analyze file' ? uploadedFileText || 'No file text loaded.' : lowered === 'analyze image' ? uploadedImageInfo || 'No image loaded.' : rawCommand.slice(8).trim(),
          context: sessionContext,
        });
        setOutputMode('analyze');
      } else if (lowered === 'recommend' || lowered.startsWith('recommend ')) {
        setOutputTitle('RECOMMENDATION ENGINE');
        nextRoute = 'recommend';
        response = await axios.post('/api/core/recommend', { text: rawCommand.length > 9 ? rawCommand.slice(9).trim() : 'based on current state', context: sessionContext });
        setOutputMode('analyze');
      } else if (lowered.startsWith('agent ') || lowered.startsWith('execute ') || lowered.startsWith('orchestrate ')) {
        const goal = rawCommand.split(/\s+/).slice(1).join(' ').trim();
        setOutputTitle(lowered.startsWith('agent ') ? 'AGENT KERNEL' : lowered.startsWith('execute ') ? 'EXECUTION KERNEL' : 'ORCHESTRATION ENGINE');
        nextRoute = lowered.startsWith('agent ') ? 'agent' : lowered.startsWith('execute ') ? 'execute' : 'orchestrate';
        response = await axios.post('/api/core/agent', { text: `${nextRoute} ${goal}`.trim(), context: sessionContext });
        setOutputMode('agent');
      } else if (lowered.startsWith('mentor ') || lowered.startsWith('reflect ') || lowered.startsWith('reframe ')) {
        const mentorText = rawCommand.split(/\s+/).slice(1).join(' ').trim();
        const commandType = lowered.split(/\s+/)[0];
        setOutputTitle(commandType === 'mentor' ? 'MENTOR NODE' : commandType === 'reflect' ? 'REFLECTION ENGINE' : 'REFRAME ENGINE');
        nextRoute = commandType;
        response = await axios.post('/api/core/mentor', { text: mentorText, context: sessionContext });
        setOutputMode('analyze');
      } else if (lowered === 'show signals') {
        setOutputTitle('SIGNAL LOG');
        nextRoute = 'show signals';
        response = await axios.get('/api/core/signals');
        setOutputMode('signals');
      } else if (lowered === 'trend signals') {
        setOutputTitle('SIGNAL TRENDS');
        nextRoute = 'trend signals';
        response = await axios.get('/api/core/signals/trends');
        setOutputMode('signal-trends');
      } else if (lowered === 'signal anomaly') {
        setOutputTitle('SIGNAL ANOMALY');
        nextRoute = 'signal anomaly';
        response = await axios.get('/api/core/signals/anomalies');
        setOutputMode('signal-anomaly');
      } else if (lowered === 'signal report') {
        setOutputTitle('SIGNAL REPORT');
        nextRoute = 'signal report';
        response = await axios.get('/api/core/signals/report');
        setOutputMode('analyze');
      } else if (lowered.startsWith('log signal ')) {
        setOutputTitle('SIGNAL RECORDED');
        nextRoute = 'log signal';
        response = await axios.post('/api/core/signals', parseSignalPayload(rawCommand.slice(11).trim()));
        setOutputMode('signals');
      } else if (lowered === 'show systems') {
        setOutputTitle('SYSTEM REGISTRY');
        nextRoute = 'show systems';
        response = await axios.get('/api/core/systems');
        setOutputMode('systems');
      } else if (lowered === 'map systems') {
        setOutputTitle('SYSTEM MAP');
        nextRoute = 'map systems';
        response = await axios.get('/api/core/systems/map');
        setOutputMode('system-map');
      } else if (lowered.startsWith('create system ')) {
        setOutputTitle('SYSTEM CREATED');
        nextRoute = 'create system';
        response = await axios.post('/api/core/systems', { name: rawCommand.slice(14).trim(), purpose: '', inputs: [], outputs: [], routines: [] });
        setOutputMode('systems');
      } else if (lowered.startsWith('run system ')) {
        setOutputTitle('SYSTEM PROTOCOL');
        nextRoute = 'run system';
        response = await axios.post('/api/core/systems/run', { name: rawCommand.slice(11).trim() });
        setOutputMode('analyze');
      } else if (lowered.startsWith('automate system ')) {
        setOutputTitle('PROTOCOL AUTOMATION');
        nextRoute = 'automate system';
        response = await axios.post('/api/core/systems/automate', { name: rawCommand.slice(16).trim() });
        setOutputMode('systems');
      } else if (lowered.startsWith('disable system ')) {
        setOutputTitle('PROTOCOL DISABLED');
        nextRoute = 'disable system';
        response = await axios.post('/api/core/systems/disable', { name: rawCommand.slice(15).trim() });
        setOutputMode('systems');
      } else if (lowered === 'protocol status') {
        setOutputTitle('PROTOCOL STATUS');
        nextRoute = 'protocol status';
        response = await axios.get('/api/core/protocol/status');
        setOutputMode('protocols');
      } else if (lowered.startsWith('task create ')) {
        setOutputTitle('TASK CREATED');
        nextRoute = 'task create';
        response = await axios.post('/api/core/tasks', { description: rawCommand.slice(12).trim() });
        setOutputMode('task-card');
      } else if (lowered === 'task show') {
        setOutputTitle('TASK LIST');
        nextRoute = 'task show';
        response = await axios.get('/api/core/tasks');
        setOutputMode('tasks');
      } else if (lowered.startsWith('task complete ')) {
        setOutputTitle('TASK COMPLETED');
        nextRoute = 'task complete';
        response = await axios.post(`/api/core/tasks/${rawCommand.slice(14).trim()}/complete`);
        setOutputMode('task-card');
      } else if (lowered === 'save recommendation') {
        const nextActions = Array.isArray(lastOverlayResult?.next_actions) ? lastOverlayResult.next_actions : [];
        setOutputTitle('RECOMMENDATION SAVED');
        nextRoute = 'save recommendation';
        response = await axios.post('/api/core/tasks/save-recommendation', { nextActions });
        setOutputMode('tasks');
      } else if (lowered.startsWith('memory save ')) {
        setOutputTitle('STRATEGIC MEMORY');
        nextRoute = 'memory save';
        response = await axios.post('/api/core/memory/save', { content: rawCommand.slice(12).trim(), sourceCommand: rawCommand });
        setOutputMode('memory');
      } else if (lowered === 'memory show') {
        setOutputTitle('STRATEGIC MEMORY');
        nextRoute = 'memory show';
        response = await axios.get('/api/core/memory');
        setOutputMode('memory-list');
      } else if (lowered.startsWith('memory search ')) {
        setOutputTitle('MEMORY SEARCH');
        nextRoute = 'memory search';
        response = await axios.get('/api/core/memory/search', { params: { query: rawCommand.slice(14).trim() } });
        setOutputMode('memory-list');
      } else if (lowered.startsWith('plan ') || lowered.startsWith('build ')) {
        const goal = rawCommand.split(/\s+/).slice(1).join(' ').trim();
        setOutputTitle(lowered.startsWith('plan ') ? 'STRATEGIC PLAN' : 'BUILD PLAN');
        nextRoute = lowered.startsWith('plan ') ? 'plan' : 'build';
        response = await axios.post('/api/core/analyze', { text: `strategic goal: ${goal}`, context: sessionContext });
        setOutputMode('analyze');
      } else if (lowered === 'monitor run') {
        setOutputTitle('AUTONOMOUS MONITOR');
        nextRoute = 'monitor run';
        response = await axios.post('/api/core/monitor/run');
        setOutputMode('monitor');
      } else if (lowered === 'alerts') {
        setOutputTitle('SYSTEM ALERTS');
        nextRoute = 'alerts';
        response = await axios.get('/api/core/alerts');
        setOutputMode('alerts');
      } else if (lowered === 'autonomy status') {
        setOutputTitle('AUTONOMY STATUS');
        nextRoute = 'autonomy status';
        response = await axios.get('/api/core/autonomy/status');
        setOutputMode('status');
      } else if (lowered === 'loop status') {
        setOutputTitle('AGENT LOOP STATUS');
        nextRoute = 'loop status';
        response = await axios.get('/api/core/loop/status');
        setOutputMode('loop');
      } else if (lowered === 'loop start') {
        setOutputTitle('AGENT LOOP ACTIVE');
        nextRoute = 'loop start';
        response = await axios.post('/api/core/loop/start');
        setOutputMode('loop');
      } else if (lowered === 'loop stop') {
        setOutputTitle('AGENT LOOP STOPPED');
        nextRoute = 'loop stop';
        response = await axios.post('/api/core/loop/stop');
        setOutputMode('loop');
      } else if (lowered === 'summary') {
        setOutputTitle('OPERATOR SUMMARY');
        nextRoute = 'summary';
        response = await axios.get('/api/core/summary');
        setOutputMode('summary');
      } else {
        runLocal('COMMAND ERROR', 'error', { message: 'Unknown command. Type help.' }, 'unknown');
        return;
      }

      const data = response?.data;
      setResult(data);
      setShowOverlay(true);
      addCommandToHistory(rawCommand);
      setRouteLabel(nextRoute);
      setActiveRouteType(nextRoute);
      setLastOverlayResult(data);
      saveSessionMemory({ recentCommands: [rawCommand, ...commandHistory].slice(0, MAX_COMMAND_HISTORY), activeRouteType: nextRoute, lastOverlayResult: data });
      setCommand('');
      await fetchSummary();
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Command execution failed.';
      const details = err?.response?.data?.details || '';
      setOutputMode('error');
      setOutputTitle('COMMAND ERROR');
      setRouteLabel('error');
      setResult({ message, details });
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

  const openOperatorPanel = async (panelKey) => {
    if (loading) return;

    try {
      setLoading(true);
      if (panelKey === 'memory') {
        const response = await axios.get('/api/core/memory');
        const entries = response.data?.entries || [];
        runLocal('MEMORY STATUS', 'memory-list', entries.length ? response.data : { entries: [] }, 'memory status');
      } else if (panelKey === 'context') {
        runLocal('CONTEXT STATUS', 'context', {
          message: operatorSummary?.state_summary || 'No context has been assembled yet.',
          activeRoute: routeLabel,
          hasLastOverlay: Boolean(lastOverlayResult),
        }, 'context status');
      } else if (panelKey === 'mode') {
        runLocal('MODE STATUS', 'context', {
          message: `Current mode ${modeFromCommand(commandLabel)} on route ${routeLabel}.`,
        }, 'mode status');
      } else if (panelKey === 'alerts') {
        const response = await axios.get('/api/core/alerts');
        const alerts = response.data?.alerts || [];
        runLocal('SYSTEM ALERTS', 'alerts', alerts.length ? response.data : { alerts: ['No active alerts.'] }, 'alerts');
      } else if (panelKey === 'tasks') {
        const response = await axios.get('/api/core/tasks');
        const tasks = response.data?.tasks || [];
        runLocal('TASK LIST', 'tasks', tasks.length ? response.data : { tasks: [{ description: 'No open tasks.', status: 'empty' }] }, 'task show');
      } else if (panelKey === 'autonomy') {
        const response = await axios.get('/api/core/autonomy/status');
        runLocal('AUTONOMY STATUS', 'status', response.data, 'autonomy status');
      } else if (panelKey === 'loop') {
        const response = await axios.get('/api/core/loop/status');
        runLocal('AGENT LOOP STATUS', 'loop', response.data, 'loop status');
      }
    } catch (error) {
      runLocal('OPERATOR STATUS', 'error', { message: error?.response?.data?.message || 'Unable to load operator panel.' }, 'operator status');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="portal-text">CALIBRATING DASHBOARD...</div>;

  const memoryStatus = operatorSummary?.memory_status || 'UNKNOWN';
  const alertsCount = operatorSummary?.active_alerts_count ?? 0;
  const taskCount = operatorSummary?.open_task_count ?? 0;

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
          <p className="light-status">MODE: {modeFromCommand(commandLabel)} | ROUTE: {routeLabel}</p>
        </div>
      </header>

      <div className="operator-strip">
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('memory')}>MEMORY ACTIVE: {memoryStatus}</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('context')}>CONTEXT LOADED</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('mode')}>MODE: {modeFromCommand(commandLabel)}</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('alerts')}>ALERTS: {alertsCount}</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('tasks')}>TASKS: {taskCount}</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('autonomy')}>AUTONOMY: {operatorSummary?.autonomy_status?.monitoring_enabled ? 'ON' : 'OFF'}</button>
        <button type="button" className="state-badge state-badge-button" onClick={() => openOperatorPanel('loop')}>AGENT LOOP: {operatorSummary?.loop_status?.active ? 'ACTIVE' : 'STOPPED'}</button>
      </div>

      <div className="summary-strip">
        <p><strong>Current mode:</strong> {modeFromCommand(commandLabel)}</p>
        <p><strong>Active route:</strong> {routeLabel}</p>
        <p><strong>Latest signal state:</strong> {operatorSummary?.state_summary || 'No summary available.'}</p>
      </div>
      <div className="summary-strip operator-panel">
        <p><strong>Latest alert summary:</strong> {(operatorSummary?.active_alerts || [])[0] || 'No active alerts.'}</p>
        <p><strong>Open task count:</strong> {taskCount}</p>
        <p><strong>Last agent decision:</strong> {operatorSummary?.loop_status?.latest_agent_summary || 'No loop decision yet.'}</p>
        <p><strong>Last loop run:</strong> {formatRecordedAt(operatorSummary?.loop_status?.last_run_at)}</p>
        <p><strong>Current mode:</strong> {operatorSummary?.loop_status?.latest_agent_mode || modeFromCommand(commandLabel)}</p>
      </div>

      <main className="crystal-grid"><section className="crystal-heart-section"><div className="crystal-prism"><div className="prism-inner"><span className="prism-label">SYZMEKU</span></div><div className="geo-ring ring-1" /><div className="geo-ring ring-2" /></div></section></main>

      <footer className="crystal-footer" style={{ position: 'relative' }}>
        {showOverlay && result && (
          <div className="overlay-panel">
            <div className="overlay-top"><p>{outputTitle}</p><button type="button" onClick={() => setShowOverlay(false)}>DISMISS</button></div>
            <div className="overlay-meta"><p>&gt; COMMAND: {commandLabel}</p><p>&gt; ROUTE: {routeLabel}</p></div>

            {outputMode === 'analyze' && (<div><p><strong>Summary:</strong> {(result?.objectives || [])[0] || 'No summary available.'}</p>{ANALYSIS_SECTIONS.map((section) => <div key={section}><p>{section.toUpperCase()}</p><ul>{(Array.isArray(result?.[section]) ? result[section] : []).map((item, index) => <li key={`${section}-${index}`}>{item}</li>)}</ul></div>)}</div>)}
            {outputMode === 'agent' && (<div><p><strong>Summary:</strong> {result?.summary || 'No summary available.'}</p><p><strong>Mode selected:</strong> {result?.mode_selected || '-'}</p><p><strong>Actions taken:</strong> {(result?.actions_taken || []).join(', ') || '-'}</p><p><strong>Recommended tasks:</strong> {(result?.recommended_tasks || []).join(' | ') || '-'}</p>{ANALYSIS_SECTIONS.map((section) => <div key={section}><p>{section.toUpperCase()}</p><ul>{(Array.isArray(result?.[section]) ? result[section] : []).map((item, index) => <li key={`${section}-${index}`}>{item}</li>)}</ul></div>)}</div>)}
            {outputMode === 'signals' && <div>{(Array.isArray(result) ? result : []).map((item, index) => <div key={index}>Sleep {item?.sleep ?? 'n/a'} | Stress {item?.stress ?? 'n/a'} | Symptoms {item?.symptoms || '-'} | {formatRecordedAt(item?.createdAt)}</div>)}</div>}
            {outputMode === 'systems' && <div>{(Array.isArray(result) ? result : [result?.system]).filter(Boolean).map((item, i) => <div key={`sys-${i}`} className="item-card system-card"><p><strong>{item?.name || 'Unnamed System'}</strong></p><p>Automation: {item?.automationEnabled ? 'enabled' : 'disabled'}</p><p>Escalation: {item?.escalationLevel || 'low'}</p></div>)}</div>}
            {outputMode === 'system-map' && <div>{(result?.systems || []).map((item, i) => <div key={`map-${i}`} className="item-card system-card"><p><strong>{item?.name || 'Unnamed System'}</strong></p><p>Purpose: {item?.purpose || '-'}</p></div>)}</div>}
            {outputMode === 'tasks' && <div>{((result?.tasks || result || [])).map((task, i) => <div key={`task-${i}`} className="item-card task-card"><p><strong>{task?.description || '(empty)'}</strong></p><p>ID: {task?._id || 'unknown'} | Status: {task?.status || 'open'}</p></div>)}</div>}
            {outputMode === 'task-card' && <div className="item-card task-card"><p><strong>{result?.description}</strong></p><p>Status: {result?.status || 'open'}</p></div>}
            {outputMode === 'signal-trends' && <div><p>Sleep: {result?.sleep?.state}</p><p>Stress: {result?.stress?.state}</p><p>Symptoms: {result?.symptoms?.state}</p></div>}
            {outputMode === 'signal-anomaly' && <div>{(result?.anomalies || []).map((a) => <p key={a}>{a}</p>)}</div>}
            {outputMode === 'protocols' && <div>{(result?.protocols || []).map((item) => <div key={item.system_name} className="item-card system-card"><p><strong>{item.system_name}</strong></p><p>Status: {item.status}</p><p>Triggers: {(item.trigger_conditions || []).join(', ') || 'none'}</p><p>Escalation: {item.escalation_level}</p></div>)}</div>}
            {outputMode === 'memory' && <div className="item-card"><p><strong>{result?.title}</strong></p><p>{result?.content}</p></div>}
            {outputMode === 'memory-list' && <div>{(result?.entries || []).map((entry) => <div key={entry._id} className="item-card"><p><strong>{entry.title}</strong> [{entry.category}]</p><p>{entry.content}</p></div>)}</div>}
            {outputMode === 'monitor' && <div><p><strong>State:</strong> {result?.state_summary}</p><p><strong>Alerts:</strong> {(result?.alerts || []).join(' | ') || '-'}</p><p><strong>Risks:</strong> {(result?.risks || []).join(' | ') || '-'}</p><p><strong>Recommended:</strong> {(result?.recommended_actions || []).join(' | ') || '-'}</p></div>}
            {outputMode === 'alerts' && <div>{(result?.alerts || []).map((a, i) => <p key={`${a}-${i}`}>{typeof a === 'string' ? a : `${a?.severity || ''}: ${a?.message || ''}`}</p>)}</div>}
            {outputMode === 'status' && <div><p>Monitoring enabled: {String(result?.monitoring_enabled)}</p><p>Last run: {formatRecordedAt(result?.last_monitor_run)}</p><p>Active alerts: {result?.active_alerts_count ?? 0}</p></div>}
            {outputMode === 'loop' && <div><p><strong>State:</strong> {result?.active ? 'ACTIVE' : 'STOPPED'}</p><p><strong>Interval:</strong> {result?.interval_ms ?? '-'} ms</p><p><strong>Last run:</strong> {formatRecordedAt(result?.last_run_at)}</p><p><strong>Run count:</strong> {result?.run_count ?? 0}</p><p><strong>Last error:</strong> {result?.last_error || '-'}</p><p><strong>Latest summary:</strong> {result?.latest_agent_summary || 'No summary yet.'}</p><p><strong>Latest mode:</strong> {result?.latest_agent_mode || '-'}</p><p><strong>Latest actions:</strong> {(result?.latest_agent_next_actions || []).join(' | ') || '-'}</p></div>}
            {outputMode === 'summary' && <div><p><strong>state_summary:</strong> {result?.state_summary}</p><p><strong>high_priority_focus:</strong> {result?.high_priority_focus}</p><p><strong>active_alerts:</strong> {(result?.active_alerts || []).join(' | ')}</p><p><strong>recommended_next_move:</strong> {result?.recommended_next_move}</p></div>}
            {outputMode === 'help' && (result?.lines || []).map((line) => <p key={line}>{line}</p>)}
            {outputMode === 'history' && (result?.commands || []).map((line, i) => <p key={`${line}-${i}`}>{i + 1}. {line}</p>)}
            {outputMode === 'context' && <p>{result?.message || `active=${result?.activeRoute}`}</p>}
            {outputMode === 'error' && <div><p>&gt; {result?.message}</p>{result?.details ? <p>&gt; {result.details}</p> : null}</div>}
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
