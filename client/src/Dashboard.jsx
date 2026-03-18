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

const buildConversation = ({ user, summary, chatAnswer, loading }) => {
  const userName = user?.username || user?.name || 'there';
  const transcript = [
    {
      id: 'welcome',
      speaker: 'syz',
      label: 'Big SYZ',
      text: `${DAILY_GREETING()}, ${userName}. I’m here to help you slow the noise down, name what matters, and choose the next grounded move. Start with how you feel, what you’re carrying, or what decision needs clarity today.`,
    },
  ];

  if (chatAnswer?.question) {
    transcript.push({
      id: 'user-question',
      speaker: 'user',
      label: 'You',
      text: chatAnswer.question,
    });
  }

  if (chatAnswer?.response) {
    transcript.push({
      id: 'mentor-answer',
      speaker: 'syz',
      label: 'Big SYZ',
      text:
        chatAnswer.response?.reasoning_summary ||
        chatAnswer.response?.summary ||
        'I analyzed your pattern and prepared a grounded next step.',
      detail: chatAnswer.internalCommand ? `Internal route: ${chatAnswer.internalCommand}` : '',
    });
  } else if (summary?.recommended_next_move) {
    transcript.push({
      id: 'mentor-nudge',
      speaker: 'syz',
      label: 'Big SYZ',
      text: `Right now I’d guide you toward this: ${summary.recommended_next_move}`,
    });
  }

  if (loading) {
    transcript.push({
      id: 'loading',
      speaker: 'syz',
      label: 'Big SYZ',
      text: 'Listening… translating your signals into a grounded response.',
      pending: true,
    });
  }

  return transcript;
};

const Dashboard = ({ user }) => {
  const [advancedMode, setAdvancedMode] = useState(false);
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

  const canAccessOperatorMode = Boolean(operatorVisibility?.canAccessOperatorMode || ['founder', 'admin'].includes(String(user?.role || '').toLowerCase()));

  const refreshMentorData = async () => {
    const [summaryRes, tasksRes, alertsRes, signalsRes, operatorRes] = await Promise.all([
      axios.get('/api/core/summary').catch(() => ({ data: null })),
      axios.get('/api/core/tasks').catch(() => ({ data: { tasks: [] } })),
      axios.get('/api/core/alerts').catch(() => ({ data: { alerts: [] } })),
      axios.get('/api/core/signals').catch(() => ({ data: { entries: [] } })),
      axios.get('/api/core/operator/visibility').catch(() => ({ data: null })),
    ]);

    setSummary(summaryRes.data || null);
    setTasks(tasksRes.data?.tasks || []);
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
  const conversation = useMemo(
    () => buildConversation({ user, summary, chatAnswer, loading }),
    [user, summary, chatAnswer, loading],
  );

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
    const prompt = QUICK_PROMPTS[type] || '';
    setChatInput(prompt);
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
    <div className="mentor-shell mentor-home-shell">
      <header className="mentor-header mentor-home-header">
        <div className="mentor-header-copy">
          <p className="mentor-eyebrow">Big SYZ Home</p>
          <h1>Mentor first. Dashboard second.</h1>
          <p className="mentor-subtitle">Emotionally intelligent support anchored in your real signals.</p>
          <p className="mentor-warmth">{DAILY_GREETING()}, {user.username}. Bring the honest version of today and let Big SYZ help you find the next clear move.</p>
          <p className="mentor-muted">Powered by the SYZMEKU Engine.</p>
        </div>

        <aside className="mentor-operator-entry mentor-card">
          <p className="mentor-section-label">Operator Access</p>
          {canAccessOperatorMode ? (
            <>
              <h2>Founder/Admin entry unlocked</h2>
              <p className="mentor-muted">This account can open the operator console for deeper system control and diagnostics.</p>
              <div className="mentor-operator-meta">
                <span className="mentor-pill success">Role: {operatorVisibility?.effectiveRole || user?.role || 'founder'}</span>
                {operatorVisibility?.accessSource && <span className="mentor-pill">Access source: {operatorVisibility.accessSource}</span>}
              </div>
              <button type="button" className="mentor-button" onClick={() => setAdvancedMode(true)}>
                Enter Operator Mode
              </button>
            </>
          ) : (
            <>
              <h2>Operator Mode is intentionally hidden</h2>
              <p className="mentor-warning-inline">Current account role: {operatorVisibility?.role || user?.role || 'user'}.</p>
              <p className="mentor-muted">If this is your founder/admin account, update that account role in the database and the operator entry point will appear here.</p>
              <div className="mentor-operator-meta">
                {operatorVisibility?.email && <span className="mentor-pill">Signed in as: {operatorVisibility.email}</span>}
                <span className="mentor-pill">Required roles: founder/admin</span>
              </div>
            </>
          )}
        </aside>
      </header>

      <main className="mentor-home-layout">
        <section className="mentor-chat-panel mentor-card">
          <div className="mentor-chat-intro">
            <div>
              <p className="mentor-section-label">Primary conversation</p>
              <h2>Talk to Big SYZ</h2>
              <p className="mentor-muted">Start with a feeling, a friction point, or a decision. The cards below stay available as support context.</p>
            </div>
            <button type="button" className="mentor-button" onClick={askMentor} disabled={loading || !chatInput.trim()}>
              Talk to Big SYZ
            </button>
          </div>

          <div className="mentor-conversation-thread">
            {conversation.map((entry) => (
              <article key={entry.id} className={`mentor-message mentor-message-${entry.speaker}${entry.pending ? ' is-pending' : ''}`}>
                <p className="mentor-message-label">{entry.label}</p>
                <p>{entry.text}</p>
                {entry.detail && <p className="mentor-message-detail">{entry.detail}</p>}
              </article>
            ))}
          </div>

          <div className="mentor-example-prompt-block">
            <p className="mentor-section-label">Example prompts</p>
            <div className="mentor-quick-actions mentor-quick-actions-wrap">
              {Object.entries(QUICK_PROMPTS).map(([key, value]) => (
                <button key={key} type="button" className="mentor-chip" onClick={() => applyQuickPrompt(key)}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="mentor-compose-box">
            <label htmlFor="mentor-chat-input" className="mentor-section-label">What do you want support with right now?</label>
            <div className="mentor-ask-row mentor-ask-row-stacked">
              <textarea
                id="mentor-chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="I need help making today feel manageable without shutting down."
                rows="4"
              />
              <div className="mentor-compose-actions">
                <button type="button" className="mentor-button" onClick={askMentor} disabled={loading || !chatInput.trim()}>
                  Talk to Big SYZ
                </button>
                <p className="mentor-muted">Big SYZ responds with emotionally intelligent pattern guidance, not diagnosis.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mentor-support-panel">
          <div className="mentor-support-grid mentor-grid">
            <section className="mentor-card">
              <p className="mentor-section-label">Today’s Insight</p>
              <h2>Your grounded next step</h2>
              <p>{buildInsightMessage(summary, latestInsight)}</p>
              <p className="mentor-muted">Emotions are indicators, not commands. Big SYZ reads emotional signals as pattern data and responds with empathy.</p>
              <button type="button" className="mentor-link" onClick={() => setShowReasoning((prev) => !prev)}>
                {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
              </button>
              {showReasoning && <p className="mentor-muted">{latestInsight?.reasoning_summary || summary?.state_summary || 'No deeper reasoning yet.'}</p>}
            </section>

            <section className="mentor-card">
              <p className="mentor-section-label">Quick Check-In</p>
              <h2>Capture today’s state</h2>
              <label>How did you sleep? ({signals.sleep} hours)</label>
              <input type="range" min="0" max="12" value={signals.sleep} onChange={(event) => setSignals((prev) => ({ ...prev, sleep: Number(event.target.value) }))} />
              <label>Stress level today? ({signals.stress})</label>
              <input type="range" min="0" max="10" value={signals.stress} onChange={(event) => setSignals((prev) => ({ ...prev, stress: Number(event.target.value) }))} />
              <label htmlFor="mentor-symptoms">Any symptoms?</label>
              <input id="mentor-symptoms" type="text" value={signals.symptoms} onChange={(event) => setSignals((prev) => ({ ...prev, symptoms: event.target.value }))} />
              <div className="mentor-inline-actions">
                <button type="button" className="mentor-button" onClick={submitCheckIn} disabled={loading}>Analyze my state</button>
                <button type="button" className="mentor-button secondary" onClick={() => axios.post('/api/core/health-sync/connect')}>Connect health data</button>
              </div>
            </section>

            <section className="mentor-card">
              <p className="mentor-section-label">Progress Path</p>
              <h2>Where this can grow</h2>
              <ul className="mentor-path-list">
                {PATH_STAGES.map((path) => (
                  <li key={path.name}><strong>{path.name}:</strong> {path.detail}</li>
                ))}
              </ul>
            </section>

            <section className="mentor-card">
              <p className="mentor-section-label">Focus for Today</p>
              <h2>High-leverage focus</h2>
              {topFocus.length ? <ol>{topFocus.map((task) => <li key={task}>{task}</li>)}</ol> : <p>No focus items yet.</p>}
            </section>

            <section className="mentor-card">
              <p className="mentor-section-label">Recent Patterns</p>
              <h2>What needs attention</h2>
              {alerts.length ? alerts.slice(0, 2).map((alert, index) => (
                <div key={`${index}-${alert?.message || alert}`} className="mentor-warning">
                  <strong>⚠ Pattern detected</strong>
                  <p>{typeof alert === 'string' ? alert : alert?.message}</p>
                </div>
              )) : <p>No risk patterns detected.</p>}
            </section>

            <section className="mentor-card">
              <p className="mentor-section-label">Action Kernel summary</p>
              <h2>Latest execution context</h2>
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
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
