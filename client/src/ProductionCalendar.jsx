import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './productionCalendar.css';

const endpoint = '/api/content-factory/production-calendar';
const labels = { COPY: 'Prepare copy', IMAGE_SELECTION: 'Select exact images', VIDEO_ASSEMBLY: 'Assemble video', VIDEO_REVIEW: 'Review finished video', FINAL_APPROVAL: 'Approve exact final draft', RELEASE: 'Release approved version', PLANNED: 'Planned', IN_PROGRESS: 'In progress', WAITING_FOR_FOUNDER: 'Waiting for my review', BLOCKED: 'Blocked', HOLD: 'On hold', COMPLETE: 'Production complete', CANCELLED: 'Cancelled' };
const messages = {
  PLAN_DATE_REQUIRED: 'Choose a start date. No date is selected automatically.', PLAN_DATE_INVALID: 'Choose a valid date between 2000 and 2100.',
  PLAN_HORIZON_INVALID: 'Choose 1–31 days for the active planning window.', PLAN_TIMEZONE_INVALID: 'Enter a valid IANA time zone, such as America/Chicago.', PLAN_TIMEZONE_REQUIRED: 'Enter a time zone explicitly.',
  PLAN_VERSION_CHANGED: 'The plan changed in another session. Refresh it before saving again.', CONTENT_VERSION_CHANGED: 'The Drive record changed in another session. Refresh before saving again.',
  PLAN_CONTENT_CHANGED: 'The linked content changed. Select its current revision explicitly before saving.', PLAN_CONTENT_REQUIRED: 'Select a prepared long-form item before marking work in progress or complete.',
  PLAN_CONTENT_ALREADY_ASSIGNED: 'That content already has an active production date. Cancel or clear its other slot first.', PLAN_DRIVE_LONGFORM_REQUIRED: 'Choose an existing long-form draft saved in private Drive.',
  PLAN_CONTENT_ON_HOLD: 'This content is held or rejected. Resolve its decision in the review queue first.', FOUNDER_IMAGE_APPROVAL_REQUIRED: 'Approve the exact images in the review queue before starting video work.',
  PLAN_RELEASE_RECEIPT_REQUIRED: 'Finish the separate exact-version release action before marking the release step complete. This still does not confirm publication.',
  PLAN_VIDEO_REVIEW_REQUIRED: 'Record the finished-video review in the queue before starting final approval or release.', PLAN_FINAL_APPROVAL_REQUIRED: 'The exact finished version must be approved in the review queue first.',
  PLAN_TIME_AMBIGUOUS: 'This time occurs twice when clocks change. Choose an unambiguous local time.', PLAN_TIME_DOES_NOT_EXIST: 'This local time does not exist when clocks change. Choose a different time.', PLAN_TIME_INVALID: 'Enter a valid local date and time.',
  PLAN_TIMEZONE_HAS_TIMES: 'Clear the saved deadlines and publication proposals before changing the time zone. Existing dates will not be silently reinterpreted.',
  DRIVE_DRAFT_AUTH_REQUIRED: 'The business Drive connection needs authorization. Nothing was saved elsewhere.', DRIVE_DRAFT_FOLDER_REQUIRED: 'The private Drive folder could not be verified. No fallback copy was saved.',
  DRIVE_DRAFT_REQUEST_FAILED: 'Drive could not confirm the request. Refresh to inspect the current plan before retrying.', PLAN_OPERATION_REUSED: 'This save attempt no longer matches the pending request. Refresh before trying again.'
};
const config = () => {
  let token = '';
  try { token = JSON.parse(localStorage.getItem('user'))?.token || localStorage.getItem('token') || ''; } catch { /* Cookies still work when local storage is unavailable. */ }
  return { withCredentials: true, timeout: 60000, headers: token ? { Authorization: `Bearer ${token}` } : {} };
};
const exact = plan => ({ expectedHash: plan?.hash || null, expectedRevision: plan?.revision || null });
const refFor = item => item ? { id: item.id, hash: item.hash, revision: item.revision, version: item.version } : null;
const errorText = error => error.response?.status === 401 ? 'Your session expired. Sign in again.' : error.response?.status === 404 ? 'Production planning is not enabled for this account.' : messages[error.response?.data?.code] || error.response?.data?.code || 'The request was not confirmed. Refresh before retrying. No automatic retry runs.';

function WindowForm({ plan, defaults, disabled, onSave }) {
  const [startDate, setStartDate] = useState(plan?.startDate || '');
  const [days, setDays] = useState(plan?.days || 7);
  const [timeZone, setTimeZone] = useState(plan?.timeZone || defaults.timeZone);
  const [acknowledged, setAcknowledged] = useState(false);
  const changedWindow = !!plan && (startDate !== plan.startDate || Number(days) !== plan.days);
  return <form className="production-form" onSubmit={event => { event.preventDefault(); onSave({ startDate, days: Number(days), timeZone }); }}>
    <fieldset disabled={disabled}><legend>{plan ? 'Roll or resize the active window' : 'Start a production plan'}</legend>
      <div className="production-form-grid">
        <label>Start date<input required type="date" min="2000-01-01" max="2100-12-31" value={startDate} onChange={event => { setStartDate(event.target.value); setAcknowledged(false); }} /></label>
        <label>Number of days<input required type="number" min="1" max={defaults.maxDays} value={days} onChange={event => { setDays(event.target.value); setAcknowledged(false); }} /></label>
        <label>Time zone<input required maxLength={80} value={timeZone} onChange={event => setTimeZone(event.target.value)} aria-describedby="production-zone-help" /></label>
      </div>
      <p id="production-zone-help">America/Chicago is the project default. Choose your date and confirm the time zone. Every date gets one empty daily long-form production slot.</p>
      {changedWindow && <label className="production-check"><input required type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I understand dates outside this window leave the active view. Their saved history remains in private Drive.</label>}
      <button type="submit" disabled={!startDate || (changedWindow && !acknowledged)}>{plan ? 'Save planning window in Drive' : 'Create empty plan in Drive'}</button>
    </fieldset>
  </form>;
}
function Slot({ slot, plan, candidates, steps, statuses, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [itemRef, setItemRef] = useState(slot.itemRef);
  const [step, setStep] = useState(slot.step);
  const [status, setStatus] = useState(slot.status);
  const [deadline, setDeadline] = useState(slot.deadline?.local || '');
  const [proposed, setProposed] = useState(slot.proposedPublication?.local || '');
  const [note, setNote] = useState(slot.note || '');
  const item = candidates.find(candidate => candidate.id === slot.itemRef?.id);
  const selected = candidates.find(candidate => candidate.id === itemRef?.id);
  const refStale = itemRef && (!selected || itemRef.hash !== selected.hash || itemRef.revision !== selected.revision || itemRef.version !== selected.version);
  const reset = () => { setItemRef(slot.itemRef); setStep(slot.step); setStatus(slot.status); setDeadline(slot.deadline?.local || ''); setProposed(slot.proposedPublication?.local || ''); setNote(slot.note || ''); setEditing(false); };
  return <article className="production-slot" aria-label={`Long-form production ${slot.date}`}>
    <div className="production-slot-heading"><h4>{slot.date} · Long-form</h4><span>{labels[slot.status]}</span></div>
    <p><strong>{item?.title || (slot.itemRef ? 'Linked content is unavailable' : 'Unassigned production slot')}</strong></p>
    <p>Planned step: {labels[slot.step]}</p>
    <p>Production deadline: {slot.deadline ? `${slot.deadline.local.replace('T', ' ')} (${plan.timeZone})` : 'Not set'}</p>
    <p>Publication proposal: {slot.proposedPublication ? `${slot.proposedPublication.local.replace('T', ' ')} (${plan.timeZone})` : 'Not set'}. This is not a scheduled post.</p>
    {slot.note && <p className="production-note">{slot.note}</p>}
    {slot.observed && <p className={slot.observed.status === 'CHANGED' ? 'production-warning' : ''}>Content: {slot.observed.status}. {slot.observed.message}</p>}
    {slot.observed?.status === 'CURRENT' && <p>Recorded approvals: images {slot.observed.imageApprovalRecorded ? 'yes' : 'pending'}, video review {slot.observed.videoReviewRecorded ? 'yes' : 'pending'}, final approval {slot.observed.finalApprovalRecorded ? 'yes' : 'pending'}.</p>}
    {slot.observed?.release && <p>Approved release receipt: {slot.observed.release.status}. Scheduling and publication are separate Social actions and are not confirmed here.</p>}
    {editing ? <form className="production-form" onSubmit={async event => {
      event.preventDefault();
      if (await onSave(slot.date, { itemRef, step, status, deadlineLocal: deadline || null, proposedPublicationLocal: proposed || null, note })) setEditing(false);
    }}><fieldset disabled={disabled}><legend>Edit production plan for {slot.date}</legend>
      <label>Existing private Drive long-form content<select value={itemRef?.id || ''} onChange={event => setItemRef(refFor(candidates.find(candidate => candidate.id === event.target.value)))}>
        <option value="">Leave unassigned</option>
        {itemRef && !selected && <option value={itemRef.id} disabled>Unavailable linked item</option>}
        {candidates.map(candidate => <option key={candidate.id} value={candidate.id} disabled={candidate.storage?.provider !== 'GOOGLE_DRIVE'}>{candidate.title} · v{candidate.version} · {candidate.status}{candidate.storage?.provider !== 'GOOGLE_DRIVE' ? ' (legacy, revise in Drive first)' : ''}</option>)}
      </select></label>
      {refStale && <p role="alert">This reference is stale. Review the current content in the queue before selecting its latest revision. {selected?.storage?.provider === 'GOOGLE_DRIVE' && <button type="button" onClick={() => setItemRef(refFor(selected))}>Use current v{selected.version}</button>}</p>}
      <div className="production-form-grid">
        <label>Planned production step<select value={step} onChange={event => setStep(event.target.value)}>{steps.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <label>Work status<select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <label>Production deadline ({plan.timeZone})<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)} /></label>
        <label>Proposed publication time ({plan.timeZone})<input type="datetime-local" value={proposed} onChange={event => setProposed(event.target.value)} /></label>
      </div>
      <label>Planning note<textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
      <p>These fields track your plan. Image selection, video review, final approval and release still require their separate exact-version actions. No publication time is recommended automatically.</p>
      <div className="production-actions"><button type="submit" disabled={!!refStale}>Save slot in Drive</button><button type="button" onClick={reset}>Cancel changes</button></div>
    </fieldset></form> : <button disabled={disabled} onClick={() => setEditing(true)}>Edit production slot</button>}
  </article>;
}
export default function ProductionCalendar() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const mounted = useRef(false), request = useRef(0), controller = useRef(null), saving = useRef(false), pending = useRef(null);
  const load = async () => {
    const id = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const result = await axios.get(endpoint, { ...config(), signal: controller.current.signal });
      if (mounted.current && id === request.current) { setData(result.data); setError(''); }
      return true;
    } catch (failure) {
      if (mounted.current && id === request.current && failure.code !== 'ERR_CANCELED') setError(errorText(failure));
      return false;
    }
  };
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; ++request.current; controller.current?.abort(); }; }, []);
  const save = async (path, method, payload) => {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    ++request.current; controller.current?.abort();
    const body = { ...exact(data?.plan), ...payload }, key = JSON.stringify({ path, method, body });
    // Repeating an unconfirmed request reuses its operation ID. There is never an
    // automatic write retry or localStorage copy of the plan or its drafts.
    if (pending.current?.key !== key) pending.current = { key, body: { ...body, operationId: crypto.randomUUID() } };
    try {
      const result = await axios({ ...config(), method, url: endpoint + path, data: pending.current.body });
      pending.current = null;
      if (mounted.current) { setData(old => ({ ...old, plan: result.data.plan })); setNotice(result.data.changed ? 'Plan saved in private Drive. Nothing was scheduled or published.' : 'The plan is already saved. Nothing was scheduled or published.'); }
      await load();
      return true;
    } catch (failure) {
      if (mounted.current) setError(errorText(failure));
      return false;
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <section className="production-calendar" aria-label="Private production calendar" aria-busy={busy}>
    <div className="production-heading"><div><h3>Daily long-form production plan</h3><p>Plan the work. Select your exact images before video production. Keep approval drafts in private Drive.</p></div><button disabled={busy} onClick={load}>Refresh plan</button></div>
    {error && <p role="alert" className="production-warning">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading private production plan…</p>}
    {data && <>
      <p className="production-boundary">The prepared catalog is seven days. A plan can cover up to {data.defaults.maxDays} dates, but empty slots do not generate scripts, images or videos. No posting algorithm, optimal posting hour or automatic publication is configured here.</p>
      {data.storage.error && <p role="alert">Content access is blocked: {messages[data.storage.error] || data.storage.error}. No fallback copy was created.</p>}
      <WindowForm key={`${data.plan?.revision || 'new'}`} plan={data.plan} defaults={data.defaults} disabled={busy || !!data.storage.error} onSave={payload => save('/window', 'post', payload)} />
      {data.plan && <>
        <p>{data.plan.startDate} through {data.plan.endDate} · {data.plan.timeZone} · revision {data.plan.version}. <a href={`https://drive.google.com/file/d/${data.plan.storage.fileId}/view`} target="_blank" rel="noreferrer">Open private Drive plan</a></p>
        <div className="production-slots">{data.plan.slots.map(slot => <Slot key={`${slot.date}:${data.plan.revision}`} slot={slot} plan={data.plan} candidates={data.candidates} steps={data.steps} statuses={data.statuses} disabled={busy || !!data.storage.error} onSave={(date, patch) => save(`/slots/${date}`, 'patch', { patch })} />)}</div>
        <details><summary>Preserved plan history</summary><p>Recent revisions are linked here. Each immutable Drive record links to its predecessor, including dates removed from the active window. No history is deleted by rolling the plan.</p>{data.plan.history.length ? <ul>{[...data.plan.history].reverse().map(revision => <li key={revision.fileId}><a href={`https://drive.google.com/file/d/${revision.fileId}/view`} target="_blank" rel="noreferrer">Revision {revision.version}</a> · {revision.updatedAt}</li>)}</ul> : <p>This is the first plan revision.</p>}</details>
      </>}
    </>}
  </section>;
}
