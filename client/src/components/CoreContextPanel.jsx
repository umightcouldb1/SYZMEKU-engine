import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './CoreContextPanel.css';

export default function CoreContextPanel({ onChanged }) {
  const [context, setContext] = useState(null);
  const [memories, setMemories] = useState([]);
  const [goal, setGoal] = useState('');
  const [measure, setMeasure] = useState('');
  const [goalId, setGoalId] = useState(null);
  const [domain, setDomain] = useState('life');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const [state, facts] = await Promise.all([axios.get('/api/core/context'), axios.get('/api/core/memory')]);
    setContext(state.data); setMemories(facts.data.entries || []);
  };
  useEffect(() => {
    let active = true;
    Promise.all([axios.get('/api/core/context'), axios.get('/api/core/memory')])
      .then(([state, facts]) => { if (active) { setContext(state.data); setMemories(facts.data.entries || []); } })
      .catch(() => { if (active) setError('Saved context could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const change = async operation => {
    setBusy(true); setError('');
    try {
      await operation(); window.dispatchEvent(new Event('core-context-changed')); await refresh(); await onChanged?.(); setEditing(null); setConfirmErase(false);
    } catch (e) { setError(e.response?.data?.message || 'The change could not be saved. Please reload and try again.'); }
    finally { setBusy(false); }
  };

  const addGoal = event => {
    event.preventDefault();
    if (!goal.trim() || !context) return;
    change(async () => {
      const entry = {description:goal.trim(),domain,successMeasure:measure.trim()};
      const goals = goalId ? context.goals.map(item => item._id === goalId ? {...item,...entry} : item) : [...(context.goals || []),entry];
      await axios.put('/api/core/context', { expectedRevision: context.revision, goals });
      setGoal(''); setMeasure(''); setGoalId(null);
    });
  };

  return (
    <section className="mentor-card core-context-panel" aria-labelledby="core-context-heading">
      <p className="mentor-section-label">Your direction and memory</p>
      <h2 id="core-context-heading">What you want to build</h2>
      <p>Save a creative, business, financial, or life goal. Wellness information is optional.</p>
      {error && <p role="alert">{error}</p>}
      {!context && !error && <p role="status">Loading saved context…</p>}
      <ul>{(context?.goals || []).map(item => <li key={item._id || item.description}><strong>{item.description}</strong>{item.successMeasure && <p>Success: {item.successMeasure}</p>}
        {item._id && <button type="button" disabled={busy} onClick={() => {setGoalId(item._id);setGoal(item.description);setMeasure(item.successMeasure || '');setDomain(item.domain || 'life');}}>Edit goal</button>}
      </li>)}</ul>
      <p className="mentor-muted">Updating your direction clears earlier conversation summaries that could repeat old context.</p>
      <form onSubmit={addGoal}>
        <label htmlFor="core-goal">Your goal</label>
        <input id="core-goal" value={goal} onChange={e => setGoal(e.target.value)} maxLength={2000} disabled={busy} required />
        <label htmlFor="core-goal-domain">Area of life</label>
        <select id="core-goal-domain" value={domain} onChange={e => setDomain(e.target.value)} disabled={busy}>
          {[...new Set(['life','business','creative','financial','wellness',domain])].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <label htmlFor="core-goal-measure">How will you know it is working? (optional)</label>
        <input id="core-goal-measure" value={measure} onChange={e => setMeasure(e.target.value)} maxLength={1000} disabled={busy} />
        <button className="mentor-button" type="submit" disabled={busy || !context || !goal.trim()}>{goalId ? 'Save goal changes' : 'Save goal'}</button>
        {goalId && <button type="button" disabled={busy} onClick={() => {setGoalId(null);setGoal('');setMeasure('');}}>Cancel goal edit</button>}
      </form>
      <h3>Saved facts and reflections</h3>
      <p>Correcting or removing a saved fact clears earlier conversation summaries that could repeat it.</p>
      {memories.length === 0 && <p>No saved facts yet.</p>}
      {memories.map(memory => <article key={memory._id}>
        {editing === memory._id ? <form onSubmit={e => { e.preventDefault(); change(() => axios.patch(`/api/core/memory/${memory._id}`, {content:draft})); }}>
          <label htmlFor={`memory-${memory._id}`}>Correct this saved fact</label>
          <textarea id={`memory-${memory._id}`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={6000} disabled={busy} required />
          <button className="mentor-button" type="submit" disabled={busy || !draft.trim()}>Save correction</button>
          <button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
        </form> : <>
          <p>{memory.content}</p>
          <p className="mentor-muted">{memory.confirmed === false ? 'Unconfirmed reflection' : 'Saved context'} · {memory.source || 'Legacy source'}</p>
          <button type="button" onClick={() => {setEditing(memory._id);setDraft(memory.content);}} disabled={busy}>Correct</button>
          <button type="button" onClick={() => change(() => axios.delete(`/api/core/memory/${memory._id}`))} disabled={busy}>Remove fact</button>
        </>}
      </article>)}
      <details>
        <summary>Personal data controls</summary>
        <p>Delete your saved personal context, goals, observations, memory, tasks and systems. Context-bearing history is redacted. Your account, purchases and Social Command records stay available.</p>
        {confirmErase ? <>
          <button type="button" onClick={() => change(() => axios.delete('/api/core/context'))} disabled={busy}>Confirm deletion of personal Core data</button>
          <button type="button" onClick={() => setConfirmErase(false)} disabled={busy}>Cancel deletion</button>
        </> : <button type="button" onClick={() => setConfirmErase(true)} disabled={busy || !context}>Delete personal Core data…</button>}
      </details>
    </section>
  );
}
