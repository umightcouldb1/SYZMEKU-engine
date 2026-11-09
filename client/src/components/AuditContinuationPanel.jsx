import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
const endpoint = '/api/core/audit-continuation';
export default function AuditContinuationPanel() {
 const [data,setData]=useState(null),[section,setSection]=useState('all'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[remove,setRemove]=useState(false);
 const generation=useRef(0),mounted=useRef(false);
 const load=async()=>{const id=++generation.current;setData(null);setRemove(false);try{const r=await axios.get(endpoint);if(mounted.current&&id===generation.current){setData(r.data);setSection(r.data.retained?.section||'all');setError('');}}catch(e){if(mounted.current&&id===generation.current)setError(e.response?.data?.message||'Retained audit could not be loaded.');}};
 useEffect(()=>{mounted.current=true;load();window.addEventListener('core-context-changed',load);return()=>{mounted.current=false;++generation.current;window.removeEventListener('core-context-changed',load);};},[]);
 const change=async(deleting)=>{if(busy||!data?.retained)return;setBusy(true);setError('');const id=generation.current;try{await axios({method:deleting?'DELETE':'PATCH',url:endpoint,data:{expectedRetained:data.expectedRetained,...(!deleting?{section}:{})}});if(mounted.current&&id===generation.current)window.dispatchEvent(new Event('core-context-changed'));}catch(e){if(mounted.current&&id===generation.current)setError(e.response?.data?.message||'Audit context could not be changed.');}finally{if(mounted.current)setBusy(false);}};
 return <section aria-label="Retained Freedom Audit"><h3>Retained Freedom Audit</h3>
 {error&&<p role="alert">{error}</p>}
 {!data?.retained?<p>No retained audit is loaded. Retain one explicitly from your saved Freedom Audit; opening Big SYZ does not import it.</p>:<>
 <p>Audit {data.retained.resultId}. The full retained copy remains in your private memory until replacement, removal or personal Core deletion. Its recommendations are proposals, not verified facts.</p>
 {data.accessAllowed?<><p>Current model context: {data.retained.section==='all'?'Full audit':'Only '+data.retained.section+'. Other sections are not included in the retained-audit context.'} Every text conversation retrieves this selection independently of chat history. If the input budget is exceeded, the request stops without truncating it.</p>
 <label>Audit context for subsequent text turns<select value={section} disabled={busy} onChange={e=>setSection(e.target.value)}>{(data.sections||[]).filter(s=>!s.startsWith('phase-')||data.audit?.liberationPlan?.[Number(s.slice(6))-1]).map(s=><option key={s} value={s}>{s==='all'?'Full audit':s==='overview'?'Overview and inputs':s}</option>)}</select></label>
 <button type="button" disabled={busy||section===data.retained.section} onClick={()=>change(false)}>Use selected context</button>
 <details><summary>Read the full retained audit</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(data.audit,null,2)}</pre></details></>:<p>Paid audit access is unavailable. This retained copy is not sent to the model. You can remove it below.</p>}
 <p>Removing this copy clears derived guidance and conversation that could repeat it. Original audit results and purchases remain unchanged.</p>
 <label><input type="checkbox" checked={remove} disabled={busy} onChange={e=>setRemove(e.target.checked)}/>Remove this retained audit and clear derived context</label>
 <button type="button" disabled={busy||!remove} onClick={()=>change(true)}>Remove retained audit</button>
 </>}
 <button type="button" disabled={busy} onClick={load}>Refresh retained audit</button></section>;
}
