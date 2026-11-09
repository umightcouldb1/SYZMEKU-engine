import React, { useEffect, useRef, useState } from 'react';
import { createImagePreviewController, previewIdentity } from './privateImagePreview';
import './imagePreview.css';

const emptyConfig = () => ({});

// Enable only for the selected scene/reference while its review panel is open.
// getRequestConfig reuses the app's existing authenticated request configuration.
export default function ImagePreview({ snapshot, enabled = false, label = 'Selected Drive image', getRequestConfig = emptyConfig }) {
  const [state, setState] = useState({ identity: '', status: 'idle', url: '', message: '' });
  const [retry, setRetry] = useState(0), request = useRef(null);
  const identity = previewIdentity(snapshot);
  const { fileId, sha256, mimeType, size } = snapshot || {};
  useEffect(() => {
    const current = createImagePreviewController({ onState: setState });
    request.current = current;
    if (enabled && identity) {
      try { current.load({ fileId, sha256, mimeType, size }, getRequestConfig()); }
      catch { setState({ identity, status: 'error', url: '', message: 'Sign in again to load this private image.' }); }
    } else current.clear();
    return () => { current.dispose(); if (request.current === current) request.current = null; };
  }, [enabled, identity, fileId, sha256, mimeType, size, getRequestConfig, retry]);

  if (!enabled || !identity) return null;
  // Hide the old image in the render that changes selection, before effect cleanup.
  const displayed = state.identity === identity ? state : { status: 'loading' };
  return <figure className="private-image-preview" aria-label={label} aria-busy={displayed.status === 'loading'}>
    {displayed.status === 'ready' && <img src={displayed.url} alt={label} decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => request.current?.imageFailed(identity, displayed.url)} />}
    {displayed.status === 'loading' && <p role="status">Loading the exact private Drive image…</p>}
    {displayed.status === 'error' && <><p role="alert">{displayed.message}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry private preview</button></>}
    <figcaption>{label}. Original bytes, displayed without cropping. Previewing does not approve this image.</figcaption>
  </figure>;
}
