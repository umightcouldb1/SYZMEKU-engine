import React, { useEffect, useId, useRef, useState } from 'react';
import axios from 'axios';
import ReasoningResult from './ReasoningResult';
import './ReasoningPanel.css';
export default function ReasoningPanel() {
  const id = useId();
  const [enabled, setEnabled] = useState(false),
    [context, setContext] = useState(null);
  const [selected, setSelected] = useState([]),
    [purpose, setPurpose] = useState('planner'),
    [text, setText] = useState('');
  const [result, setResult] = useState(null),
    [records, setRecords] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [correction, setCorrection] = useState(null),
    [replacement, setReplacement] = useState(''),
    [hard, setHard] = useState(true);
  const active = useRef(null),
    version = useRef(0);
  useEffect(() => {
    let live = true;
    async function refresh() {
      const epoch = ++version.current;
      active.current?.abort();
      setResult(null);
      setRecords([]);
      setCorrection(null);
      setBusy(false);
      try {
        const {
          data
        } = await axios.get('/api/core/reasoning/capability');
        if (!live || epoch !== version.current) return;
        setEnabled(data.enabled);
        if (!data.enabled) return;
        const state = await axios.get('/api/core/context');
        if (!live || epoch !== version.current) return;
        setContext(state.data);
        setSelected([]);
      } catch {
        if (live && epoch === version.current) setEnabled(false);
      }
    }
    refresh();
    window.addEventListener('core-context-changed', refresh);
    const hide = () => {
      ++version.current;
      active.current?.abort();
      setResult(null);
      setRecords([]);
      setBusy(false);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      live = false;
      ++version.current;
      active.current?.abort();
      window.removeEventListener('core-context-changed', refresh);
      window.removeEventListener('pagehide', hide);
    };
  }, []);
  async function run(operation) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const epoch = ++version.current;
    setBusy(true);
    setError('');
    setResult(null);
    setRecords([]);
    try {
      await operation(controller.signal, () => epoch === version.current);
    } catch (e) {
      if (epoch === version.current && e.code !== 'ERR_CANCELED') {
        setError(e.response?.data?.error?.message || e.response?.data?.message || 'Could not complete the request.');
        setRecords([]);
      }
    } finally {
      if (epoch === version.current) setBusy(false);
    }
  }
  const generate = save => run(async (signal, current) => {
    const response = await axios.post('/api/core/reasoning/' + (save ? 'records' : 'preview'), {
      purpose,
      text,
      selectedGoalIds: selected,
      ...(save ? {
        requestKey: crypto.randomUUID()
      } : {})
    }, {
      signal
    });
    if (current()) setResult(response.data);
  });
  const loadRecords = () => run(async (signal, current) => {
    const response = await axios.get('/api/core/reasoning/records', {
      signal
    });
    if (current()) setRecords(response.data.records);
  });
  if (!enabled) return null;
  const goals = context?.goals?.filter(g => g._id && g.status === 'active') || [];
  return <section className="mentor-card reasoning-panel" aria-label="Reasoning and planning">
    <h2>Reason from your goals</h2><p>Choose goals in priority order. Review proposals, evidence, and a draft plan before deciding what to do.</p>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy}><legend>Your goal order</legend>{goals.map(g => <label key={g._id}><input type="checkbox" checked={selected.includes(g._id)} onChange={e => {
          setResult(null);
          setSelected(ids => e.target.checked ? [...ids, g._id] : ids.filter(x => x !== g._id));
        }} />{selected.includes(g._id) ? `${selected.indexOf(g._id) + 1}. ` : ''}{g.description}</label>)}</fieldset>
    {!goals.length && <p>Save an active goal in “What you want to build” first.</p>}
    <label htmlFor={id + '-purpose'}>What would help?</label><select id={id + '-purpose'} value={purpose} disabled={busy} onChange={e => {
      setPurpose(e.target.value);
      setResult(null);
    }}>{['mentor', 'recommend', 'planner'].map(p => <option key={p} value={p}>{p}</option>)}</select>
    <label htmlFor={id + '-request'}>Your request</label><textarea id={id + '-request'} value={text} maxLength={8000} disabled={busy} onChange={e => {
      setText(e.target.value);
      setResult(null);
    }} />
    <div className="reasoning-actions"><button type="button" disabled={busy || !text.trim() || !goals.length} onClick={() => generate(false)}>Generate preview</button><button type="button" disabled={busy || !text.trim() || !goals.length} onClick={() => generate(true)}>Generate and save</button><button type="button" disabled={busy} onClick={loadRecords}>Load saved guidance</button></div>
    {busy && <p role="status">Checking your context…</p>}
    <ReasoningResult result={result} />
    {result?.constraintConflicts?.map(c => <div key={c.id}><p>Saved constraint: {c.description}</p><button type="button" disabled={busy} onClick={() => {
        setCorrection(c);
        setReplacement(c.description);
        setHard(true);
      }}>This constraint has changed…</button></div>)}
    {correction && <form onSubmit={e => {
      e.preventDefault();
      run(async (signal, current) => {
        // Explicit confirmation uses only the existing M1 correction endpoint.
        const latest = await axios.get('/api/core/context', {
          signal
        });
        const target = latest.data.constraints.find(c => c._id === correction.id);
        if (!target || target.description !== correction.description) throw new Error('Context changed');
        await axios.put('/api/core/context', {
          expectedRevision: latest.data.revision,
          constraints: latest.data.constraints.map(c => c._id === correction.id ? {
            ...c,
            description: replacement,
            hard
          } : c)
        }, {
          signal
        });
        if (current()) window.dispatchEvent(new Event('core-context-changed'));
      });
    }}><label htmlFor={id + '-correction'}>Replacement saved constraint</label><textarea id={id + '-correction'} value={replacement} maxLength={2000} required onChange={e => setReplacement(e.target.value)} /><label><input type="checkbox" checked={hard} onChange={e => setHard(e.target.checked)} />Keep as a hard constraint</label><p>Confirming updates saved context and clears earlier derived guidance. Generate again afterward.</p><button disabled={busy || !replacement.trim()}>Confirm saved constraint correction</button><button type="button" disabled={busy} onClick={() => setCorrection(null)}>Cancel correction</button></form>}
    {records.map(r => <article key={r.id}><h3>Saved {r.purpose} · {r.status}</h3>{r.payload ? <ReasoningResult result={r.payload} /> : <p>{r.message}</p>}<button type="button" disabled={busy} onClick={() => run(async (signal, current) => {
        await axios.patch('/api/core/reasoning/records/' + r.id, {
          expectedRevision: r.revision,
          status: 'archived'
        }, {
          signal
        });
        if (current()) setRecords(xs => xs.filter(x => x.id !== r.id));
      })}>Archive saved guidance</button><button type="button" disabled={busy} onClick={() => run(async (signal, current) => {
        await axios.delete('/api/core/reasoning/records/' + r.id, {
          signal
        });
        if (current()) setRecords(xs => xs.filter(x => x.id !== r.id));
      })}>Delete saved guidance</button></article>)}
  </section>;
}
