import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './ReasoningPanel.css';
function Evidence({
  reference
}) {
  const [source, setSource] = useState(null),
    [error, setError] = useState('');
  const active = useRef(null);
  useEffect(() => {
    const clear = () => {
      active.current?.abort();
      setSource(null);
    };
    window.addEventListener('core-context-changed', clear);
    return () => {
      active.current?.abort();
      window.removeEventListener('core-context-changed', clear);
    };
  }, []);
  return <div><button type="button" onClick={async () => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setSource(null);
      setError('');
      try {
        const {
          data
        } = await axios.get('/api/core/reasoning/evidence', {
          params: {
            ref: reference
          },
          signal: controller.signal
        });
        if (!controller.signal.aborted) setSource(data);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.response?.data?.error?.message || 'Evidence is unavailable.');
      }
    }}>Review recorded evidence ({reference.split(':')[0]})</button>
    {error && <p role="alert">{error}</p>}{source && <blockquote><p>{source.reference.kind}</p><p>{source.entry.description || source.entry.content || source.entry.notes || source.entry.text || source.entry.hypothesis || 'Recorded operation metadata; human outcome unknown.'}</p><p>Source: {source.entry.source || 'Canonical owned record'}</p></blockquote>}
  </div>;
}
export default function ReasoningResult({
  result
}) {
  if (!result || result.schemaVersion !== 'reasoning-v1') return null;
  const refs = values => values?.length ? values.map(ref => <Evidence key={ref} reference={ref} />) : 'No independent supporting evidence';
  return <section className="reasoning-result" aria-label="Reasoning result">
    <p role="status">{result.summary}</p>
    <p>{result.persistence?.saved ? 'Saved guidance' : 'Unsaved preview'} · Personal execution disabled</p>
    {!!result.questions?.length && <ul>{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
    {result.claims?.map((claim, i) => <blockquote key={i}><p>Supported Pattern: {claim.text}</p><p>{claim.confidence} · Association, not proof of cause.</p></blockquote>)}
    <ol>{result.recommendations?.map(r => <li key={r.id}>
      <p><strong>Proposal: {r.description}</strong></p><p>{r.feasibility === 'needs_clarification' ? 'Clarification required' : 'For your review'} · Estimated effort: {r.effort.band}</p>
      <p>{r.effort.basis}</p><p>Proposed success: {r.successCriteria.join(' · ')}</p>
      <p>Uncertainty: {r.uncertainty.join(' · ') || 'Human outcome remains unknown.'}</p>
      <details><summary>Why this order and recorded references</summary><ul>{r.priorityReasons?.map((v, i) => <li key={i}>{v}</li>)}</ul><div>{refs(r.evidenceRefs)}</div></details>
    </li>)}</ol>
    {result.plan && <article aria-label="Draft plan"><h3>{result.plan.title}</h3><p>Draft for review. Saving does not create tasks or authorize execution.</p>
      <ol>{result.plan.steps.map(s => <li key={s.id}><strong>{s.description}</strong><p>Depends on: {s.dependsOn.join(', ') || 'No prior step'}</p><p>Effort: {s.effort.band} — {s.effort.basis}</p><p>Success: {s.successCriteria.join(' · ')}</p><p>Uncertainty: {s.uncertainty.join(' · ')}</p></li>)}</ol>
    </article>}
    <details><summary>Coverage and limitations</summary><ul>{result.limitations?.map((v, i) => <li key={i}>{v}</li>)}</ul><p>{Object.entries(result.context?.coverage || {}).map(([k, v]) => `${k}: ${v.included} included${v.truncated ? ', incomplete coverage' : ''}`).join(' · ')}</p></details>
  </section>;
}
