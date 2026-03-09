import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import OperatorConsole from './OperatorConsole';
import './dashboard.css';

const FALLBACK_INSIGHT = 'No insight yet. Complete a check-in or ask SYZMEKU.';

const Dashboard = ({ user }) => {
  const [activeView, setActiveView] = useState('mentor');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [latestReasoning, setLatestReasoning] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askResponse, setAskResponse] = useState('');
  const [checkIn, setCheckIn] = useState({
    sleep: 6,
    stress: 3,
    symptoms: '',
    mood: '',
  });

  const refreshData = async () => {
    const [summaryRes, tasksRes, signalsRes] = await Promise.all([
      axios.get('/api/core/summary').catch(() => ({ data: null })),
      axios.get('/api/core/tasks').catch(() => ({ data: { tasks: [] } })),
      axios.get('/api/core/signals').catch(() => ({ data: { entries: [] } })),
    ]);

    setSummary(summaryRes.data || null);
    setTasks(tasksRes.data?.tasks || []);

    const latestSignal = signalsRes.data?.entries?.[0];
    if (latestSignal) {
      setCheckIn((prev) => ({
        ...prev,
        sleep: latestSignal.sleep ?? prev.sleep,
        stress: latestSignal.stress ?? prev.stress,
        symptoms: latestSignal.symptoms ?? prev.symptoms,
        mood: latestSignal.mood ?? prev.mood,
      }));
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const insightText = useMemo(
    () => latestReasoning || summary?.reasoning_summary || FALLBACK_INSIGHT,
    [latestReasoning, summary?.reasoning_summary]
  );

  const focusItems = useMemo(
    () => (tasks || []).map((task) => task?.description).filter(Boolean).slice(0, 3),
    [tasks]
  );

  const analyzeState = async () => {
    setLoading(true);
    try {
      await axios.post('/api/core/signals', checkIn);
      const analysis = await axios.post('/api/core/analyze', {
        text: `sleep=${checkIn.sleep} stress=${checkIn.stress} symptoms=${checkIn.symptoms || 'none'} mood=${checkIn.mood || 'unspecified'}`,
      });
      const reason = analysis.data?.reasoning_summary || analysis.data?.summary || '';
      setLatestReasoning(reason);
      setAskResponse('');
      await refreshData();
    } finally {
      setLoading(false);
    }
  };

  const askMentor = async () => {
    if (!askInput.trim()) return;
    setLoading(true);
    try {
      const normalized = askInput.trim();
      const useRecommend = /recommend|priority|next move|what should i do/i.test(normalized);
      const response = useRecommend
        ? await axios.post('/api/core/recommend', { text: normalized })
        : await axios.post('/api/core/analyze', { text: normalized });

      const answer = response.data?.reasoning_summary || response.data?.summary || response.data?.recommendation || 'I analyzed your state and prepared guidance.';
      setAskResponse(answer);
      setLatestReasoning(answer);
      setAskInput('');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="portal-text">CALIBRATING DASHBOARD...</div>;

  if (activeView === 'operator') {
    return (
      <div>
        <div className="mentor-view-toggle-shell">
          <button type="button" className="mentor-view-toggle" onClick={() => setActiveView('mentor')}>Mentor View</button>
          <button type="button" className="mentor-view-toggle active" onClick={() => setActiveView('operator')}>Operator View</button>
        </div>
        <OperatorConsole user={user} />
      </div>
    );
  }

  return (
    <div className="crystalline-container mentor-mode-shell">
      <div className="nebula-1" />
      <div className="nebula-2" />

      <header className="mentor-mode-header">
        <div>
          <h1>SYZMEKU Mentor</h1>
          <p>Good day, {user.username}. Here is your daily intelligence panel.</p>
        </div>
        <div className="mentor-view-toggle-shell in-header">
          <button type="button" className="mentor-view-toggle active" onClick={() => setActiveView('mentor')}>Mentor View</button>
          <button type="button" className="mentor-view-toggle" onClick={() => setActiveView('operator')}>Operator View</button>
        </div>
      </header>

      <main className="mentor-mode-grid">
        <section className="crystal-shard mentor-section">
          <h2>TODAY'S INSIGHT</h2>
          <p>{insightText}</p>
          <button type="button" className="mentor-link-button" onClick={() => setDetailsOpen(true)}>View details</button>
        </section>

        <section className="crystal-shard mentor-section">
          <h2>QUICK CHECK-IN</h2>
          <label>Sleep ({checkIn.sleep}h)</label>
          <input type="range" min="0" max="12" value={checkIn.sleep} onChange={(event) => setCheckIn((prev) => ({ ...prev, sleep: Number(event.target.value) }))} />
          <label>Stress ({checkIn.stress}/10)</label>
          <input type="range" min="0" max="10" value={checkIn.stress} onChange={(event) => setCheckIn((prev) => ({ ...prev, stress: Number(event.target.value) }))} />
          <label>Symptoms</label>
          <input type="text" value={checkIn.symptoms} onChange={(event) => setCheckIn((prev) => ({ ...prev, symptoms: event.target.value }))} />
          <label>Mood</label>
          <input type="text" value={checkIn.mood} onChange={(event) => setCheckIn((prev) => ({ ...prev, mood: event.target.value }))} />
          <button type="button" className="mentor-primary-button" onClick={analyzeState} disabled={loading}>Analyze my state</button>
        </section>

        <section className="crystal-shard mentor-section">
          <h2>TODAY'S FOCUS</h2>
          {focusItems.length ? (
            <ol>
              {focusItems.map((item) => <li key={item}>{item}</li>)}
            </ol>
          ) : (
            <p>No focus items yet.</p>
          )}
        </section>

        <section className="crystal-shard mentor-section">
          <h2>ASK SYZMEKU</h2>
          <div className="mentor-ask-row">
            <input
              type="text"
              value={askInput}
              placeholder="What do you need help with today?"
              onChange={(event) => setAskInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  askMentor();
                }
              }}
            />
            <button type="button" className="mentor-primary-button" onClick={askMentor} disabled={loading}>Ask</button>
          </div>
          {askResponse ? <p className="mentor-ask-response">{askResponse}</p> : null}
        </section>
      </main>

      {detailsOpen ? (
        <div className="mentor-details-backdrop" onClick={() => setDetailsOpen(false)}>
          <div className="mentor-details-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Latest reasoning</h3>
            <p>{latestReasoning || summary?.state_summary || FALLBACK_INSIGHT}</p>
            <button type="button" className="mentor-view-toggle" onClick={() => setDetailsOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
