import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import OperatorConsole from './OperatorConsole';
import './dashboard.css';

const DAILY_GREETING = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const buildInsightMessage = (summary, analysis) => {
  if (analysis?.reasoning_summary) return analysis.reasoning_summary;
  if (summary?.recommended_next_move) return summary.recommended_next_move;
  return 'Your signals are stable. Focus on one high-leverage task before noon.';
};

const QUICK_PROMPTS = {
  overwhelmed: 'I feel overwhelmed',
  focus: 'Help me focus',
  patterns: 'What patterns are you noticing?',
  dayPlan: 'Help me plan my day',
  off: 'I feel off today',
};

const PATH_STAGES = [
  { name: 'Initiate', detail: 'Mentor chat, simple insights, and daily check-ins.' },
  { name: 'Alignment', detail: 'Pattern-building with stronger recommendations.' },
  { name: 'Ascension', detail: 'Strategic prediction and protocol-level guidance.' },
  { name: 'Mastery', detail: 'Full pattern intelligence and advanced planning.' },
];

const normalizeFocusTasks = (tasks = []) => tasks.map((task) => task?.description).filter(Boolean);

const Dashboard = ({ user }) => {
  const [advancedMode, setAdvancedMode] = useState(false);
  const canAccessOperatorMode = ['founder', 'admin'].includes(String(user?.role || '').toLowerCase());
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [signals, setSignals] = useState({ sleep: 6, stress: 3, symptoms: 'calm' });
  const [chatInput, setChatInput] = useState('');
  const [chatAnswer, setChatAnswer] = useState(null);
  const [latestInsight, setLatestInsight] = useState(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [operatorVisibility, setOperatorVisibility] = useState(null);

  const refreshMentorData = async () => {
    const [summaryRes, tasksRes, alertsRes, signalsRes, operatorRes] = await Promise.all([
      axios.get('/api/core/summary').catch(() => ({ data: null })),
      axios.get('/api/core/tasks').catch(() => ({ data: { tasks: [] } })),
      axios.get('/api/core/alerts').catch(() => ({ data: { alerts: [] } })),
      axios.get('/api/core/signals').catch(() => ({ data: { entries: [] } })),
      axios.get('/api/core/operator/visibility').catch(() => ({ data: null })),
    ]);

    setSummary(summaryRes.data || null);
    const nextTasks = tasksRes.data?.tasks || [];
    setTasks(nextTasks);
    setAlerts(alertsRes.data?.alerts || []);

    setOperatorVisibility(operatorRes.data || null);

    const latestSignal = signalsRes.data?.entries?.[0];
    if (latestSignal) {
      setSignals({
        sleep: latestSignal.sleep ?? 6,
        stress: latestSignal.stress ?? 3,
        symptoms: latestSignal.symptoms ?? 'calm',
      });
    }
  };

  useEffect(() => {
    refreshMentorData();
  }, []);

  const topFocus = useMemo(() => normalizeFocusTasks(tasks).slice(0, 3), [tasks]);

  const submitCheckIn = async () => {
    setLoading(true);
    try {
      await axios.post('/api/core/signals', signals);
      const analysis = await axios.post('/api/core/analyze', {
        text: `sleep=${signals.sleep} stress=${signals.stress} symptoms=${signals.symptoms}`,
      });
      setLatestInsight(analysis.data);
      await refreshMentorData();
    } finally {
      setLoading(false);
    }
  };

  const askMentor = async () => {
    if (!chatInput.trim()) return;
    setLoading(true);
    try {
      const internalCommand = `analyze ${chatInput.trim()}`;
      const response = await axios.post('/api/core/analyze', {
        text: internalCommand.replace(/^analyze\s+/i, ''),
      });
      setChatAnswer({
        question: chatInput,
        response: response.data,
        internalCommand,
      });
      setLatestInsight(response.data);
      setChatInput('');
    } finally {
      setLoading(false);
    }
  };

  const applyQuickPrompt = (type) => {
    setChatInput(QUICK_PROMPTS[type] || '');
  };

  if (!user) return <div className="portal-text">CALIBRATING DASHBOARD...</div>;


  if (advancedMode && canAccessOperatorMode) {
    return (
      <div>
        <div className="mentor-top-toggle">
          <button type="button" className="mentor-button secondary" onClick={() => setAdvancedMode(false)}>
            Back to Big SYZ
          </button>
        </div>
        <OperatorConsole user={user} />
      </div>
    );
  }

  return (
    <div className="mentor-shell">
      <header className="mentor-header">
        <div>
          <h1>Big SYZ</h1>
          <p className="mentor-subtitle">Emotionally intelligent mentor platform.</p>
          <p className="mentor-warmth">Tell Big SYZ what’s going on. You’re not doing this alone.</p>
          <p className="mentor-muted">Powered by the SYZMEKU Engine.</p>
          <p>{DAILY_GREETING()}, {user.username}.</p>
        </div>
        {canAccessOperatorMode && (
          <button type="button" className="mentor-button secondary" onClick={() => setAdvancedMode(true)}>
            Operator Mode
          </button>
        )}
        {!canAccessOperatorMode && operatorVisibility && (
          <p className="mentor-warning-inline">Operator Mode hidden for role: {operatorVisibility.role}. Founder/admin required.</p>
        )}
      </header>

      <section className="mentor-cta"><button type="button" className="mentor-button" onClick={() => setActiveScreen('ask')}>Talk to Big SYZ</button></section>

      <nav className="mentor-nav">
        {[
          ['dashboard', 'Mentor Dashboard'],
          ['ask', 'Ask SYZMEKU'],
          ['focus', 'Focus Board'],
          ['patterns', 'Pattern Intelligence'],
        ].map(([key, label]) => (
          <button key={key} type="button" className={`mentor-button ${activeScreen === key ? 'active' : ''}`} onClick={() => setActiveScreen(key)}>{label}</button>
        ))}
      </nav>

      {activeScreen === 'dashboard' && (
        <main className="mentor-grid">
          <section className="mentor-card">
            <h2>Today's Insight</h2>
            <p>{buildInsightMessage(summary, latestInsight)}</p>
            <p className="mentor-muted">Emotions are indicators, not commands. We read emotional signals as pattern data and respond with empathy.</p>
            <button type="button" className="mentor-link" onClick={() => setShowReasoning((prev) => !prev)}>
              {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
            </button>
            {showReasoning && <p className="mentor-muted">{latestInsight?.reasoning_summary || summary?.state_summary || 'No deeper reasoning yet.'}</p>}
          </section>

          <section className="mentor-card">
            <h2>Quick Check-In</h2>
            <label>How did you sleep? ({signals.sleep} hours)</label>
            <input type="range" min="0" max="12" value={signals.sleep} onChange={(event) => setSignals((prev) => ({ ...prev, sleep: Number(event.target.value) }))} />
            <label>Stress level today? ({signals.stress})</label>
            <input type="range" min="0" max="10" value={signals.stress} onChange={(event) => setSignals((prev) => ({ ...prev, stress: Number(event.target.value) }))} />
            <label>Any symptoms?</label>
            <input type="text" value={signals.symptoms} onChange={(event) => setSignals((prev) => ({ ...prev, symptoms: event.target.value }))} />
            <button type="button" className="mentor-button" onClick={submitCheckIn} disabled={loading}>Analyze my state</button>
            <button type="button" className="mentor-button secondary" onClick={() => axios.post('/api/core/health-sync/connect')}>Connect health data</button>
          </section>

          <section className="mentor-card">
            <h2>Progress Path</h2>
            <ul className="mentor-path-list">
              {PATH_STAGES.map((path) => (
                <li key={path.name}><strong>{path.name}:</strong> {path.detail}</li>
              ))}
            </ul>
          </section>

          <section className="mentor-card">
            <h2>Focus for Today</h2>
            {topFocus.length ? (
              <ol>{topFocus.map((task) => <li key={task}>{task}</li>)}</ol>
            ) : (
              <p>No focus items yet.</p>
            )}
          </section>

          <section className="mentor-card">
            <h2>Recent Patterns</h2>
            {alerts.length ? alerts.slice(0, 2).map((alert, index) => (
              <div key={`${index}-${alert?.message || alert}`} className="mentor-warning">
                <strong>⚠ Pattern detected</strong>
                <p>{typeof alert === 'string' ? alert : alert?.message}</p>
              </div>
            )) : <p>No risk patterns detected.</p>}
          </section>

          <section className="mentor-card">
            <h2>Action Kernel</h2>
            {(summary?.latest_actions || []).length ? (
              <ul className="mentor-path-list">
                {(summary?.latest_actions || []).slice(0, 3).map((action) => (
                  <li key={action?._id || `${action?.action_name}-${action?.timestamp}`}>
                    <strong>{action?.action_name || 'action'}:</strong> {action?.success ? 'success' : 'failed'}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No actions executed yet.</p>
            )}
            <p className="mentor-muted">Last execution: {summary?.latest_actions?.[0]?.error || 'No errors reported.'}</p>
          </section>
        </main>
      )}

      {activeScreen === 'ask' && (
        <section className="mentor-card">
          <h2>Ask Big SYZ</h2>
          <p>Ask anything about your patterns, productivity, state, or next decision.</p>
          <div className="mentor-quick-actions">
            <button type="button" className="mentor-chip" onClick={() => applyQuickPrompt('overwhelmed')}>I feel overwhelmed</button>
            <button type="button" className="mentor-chip" onClick={() => applyQuickPrompt('focus')}>Help me focus</button>
            <button type="button" className="mentor-chip" onClick={() => applyQuickPrompt('patterns')}>What patterns are you noticing?</button>
            <button type="button" className="mentor-chip" onClick={() => applyQuickPrompt('dayPlan')}>Help me plan my day</button>
            <button type="button" className="mentor-chip" onClick={() => applyQuickPrompt('off')}>I feel off today</button>
          </div>
          <p className="mentor-muted">Examples: "I feel overwhelmed" · "Help me focus" · "What patterns are you noticing?" · "Help me plan my day" · "I feel off today".</p>
          <div className="mentor-ask-row">
            <input type="text" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="I feel like my productivity collapses after lunch" />
            <button type="button" className="mentor-button" onClick={askMentor} disabled={loading}>Ask</button>
          </div>
          {chatAnswer && (
            <div className="mentor-answer">
              <p><strong>You:</strong> {chatAnswer.question}</p>
              <p><strong>SYZMEKU:</strong> {chatAnswer.response?.reasoning_summary || chatAnswer.response?.summary || 'I analyzed your pattern and prepared recommendations.'}</p>
            </div>
          )}
        </section>
      )}

      {activeScreen === 'focus' && (
        <section className="mentor-card">
          <h2>Focus Board</h2>
          {normalizeFocusTasks(tasks).length ? <ol>{normalizeFocusTasks(tasks).map((task) => <li key={task}>{task}</li>)}</ol> : <p>No focus items yet.</p>}
        </section>
      )}

      {activeScreen === 'patterns' && (
        <section className="mentor-card">
          <h2>Pattern Intelligence</h2>
          <p>{summary?.state_summary || 'Not enough pattern data yet. Keep checking in daily.'}</p>
          <p className="mentor-muted">Suggested next move: {summary?.recommended_next_move || 'Complete your daily check-in to generate a personalized recommendation.'}</p>
        </section>
      )}
    </div>
  );
};

export default Dashboard;
