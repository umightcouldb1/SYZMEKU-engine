import { useState } from 'react';
import axios from 'axios';
export const eventKey = text => text.trim().toLowerCase().replace(/\s+/g,'-');
export const typedValue = text => text === 'true' ? true : text === 'false' ? false : text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
export default function PatternObservationForm({ onChanged, tasks=[] }) {
  const [state,setState]=useState({domain:'business',subject:'focus-block',metric:'completed',value:'true',at:'',notes:'',phase:'',intervention:'',unit:'',coverageStart:'',coverageEnd:'',taskRef:''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const field=(name,label,type='text',required=false)=><label>{label}<input type={type} value={state[name]} required={required} disabled={busy} maxLength={type==='text'?200:undefined} onChange={e=>setState({...state,[name]:e.target.value})}/></label>;
  async function save(e){e.preventDefault();setBusy(true);setError('');try{
    const event={subjectKey:eventKey(state.subject),values:{[eventKey(state.metric)]:typedValue(state.value)}};
    if(state.unit)event.unit=eventKey(state.unit);
    if(state.phase)Object.assign(event,{phase:state.phase,interventionKey:eventKey(state.intervention)});
    if(state.coverageStart&&state.coverageEnd)event.coverage={start:new Date(state.coverageStart).toISOString(),end:new Date(state.coverageEnd).toISOString(),complete:true};
    if(state.taskRef)event.taskRef=state.taskRef;
    await axios.post('/api/core/signals',{domain:eventKey(state.domain),observationType:'recorded-event',occurredAt:new Date(state.at).toISOString(),notes:state.notes,sourceId:crypto.randomUUID(),event});
    setState({...state,notes:'',at:''});await onChanged();
  }catch(err){setError(err.response?.data?.message||'The observation could not be saved.');}finally{setBusy(false);}}
  return <details className="pattern-form"><summary>Record an observation</summary><p>Describe one event that actually happened. Copies of the same event are not independent evidence. No wellness information is required.</p>
    <form onSubmit={save}>{field('domain','Area of life','text',true)}{field('subject','Activity or situation','text',true)}{field('metric','What did you observe?','text',true)}{field('value','Recorded value (true, false, a number, or a short label)','text',true)}{field('at','When did it happen?','datetime-local',true)}{field('notes','Notes')}
      <label>Related task, if reporting an outcome<select value={state.taskRef} onChange={e=>setState({...state,taskRef:e.target.value})}><option value="">No task</option>{tasks.map(t=><option key={t._id} value={t._id}>{t.description}</option>)}</select></label>
      {state.taskRef&&<p>Use the activity named in your task intention. Record completed as false only if you are explicitly reporting noncompletion, not because a record is missing.</p>}
      <details><summary>Intervention or observation coverage</summary><p>Recording an intervention reports something you already did; it does not run an action.</p>
        <label>Observation phase<select value={state.phase} onChange={e=>setState({...state,phase:e.target.value})}><option value="">Ordinary event</option><option value="baseline">Before an intervention</option><option value="intervention">Intervention occurred</option><option value="post">After an intervention</option></select></label>
        {state.phase&&field('intervention','Name of this intervention episode','text',true)}{field('unit','Measurement unit, if applicable')}
        <p>Only complete these times if you observed the entire period. Missing records alone are not evidence that something did not happen.</p>{field('coverageStart','Observed period starts','datetime-local')}{field('coverageEnd','Observed period ends','datetime-local')}
      </details>
      {error&&<p role="alert">{error}</p>}<button disabled={busy}>Save observation</button>
    </form></details>;
}
