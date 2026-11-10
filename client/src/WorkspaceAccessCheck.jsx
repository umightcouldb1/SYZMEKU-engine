import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const labels = { connection: 'Existing business connection', scopes: 'Existing permission record', canonicalConfiguration: 'Configured private folders', token: 'Existing token', businessIdentity: 'Business account identity', rootFolder: 'Root folder', contentFactoryFolder: 'Content Factory folder', organicFolder: 'Organic folder', originalLogo: 'Exact original logo' };

export default function WorkspaceAccessCheck({ getRequestConfig }) {
  const [report, setReport] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  const check = async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setReport(null);
    try {
      const result = await axios.post('/api/content-factory/workspace/drive-access-check', {}, { ...getRequestConfig(), signal: controller.signal });
      if (mounted.current) setReport(result.data);
    } catch (failure) {
      if (mounted.current && failure.code !== 'ERR_CANCELED') setError(failure.response?.status === 401 ? 'Your session expired. Sign in again.' : 'The existing access check could not finish. Nothing was created or shared.');
    } finally { if (active.current === controller) active.current = null; if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Existing app-scoped Drive access" aria-busy={busy}>
    <button disabled={busy} onClick={check}>{busy ? 'Checking existing Drive access…' : 'Check existing Drive access'}</button>
    <p>This checks this app’s existing business-account access to its private draft folders and the original logo. It does not create files or request more permissions.</p>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <p role="status">{report.ready ? 'Existing access verified for the private draft folders and original logo. Live production verification is still pending.' : 'Existing access is blocked. No files, folders or expanded permissions were created.'}</p>
      <ul>{report.checks.map(check => <li key={check.id}>{labels[check.id] || check.id}: {check.status}{check.message ? `. ${check.message}` : ''}</li>)}</ul>
      <p>Folder access does not automatically grant access to every image or video inside it. Each selected source is checked separately.</p>
    </>}
  </section>;
}
