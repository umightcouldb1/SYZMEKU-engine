const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const previewIdentity = snapshot => snapshot && /^[a-zA-Z0-9_-]{10,150}$/.test(snapshot.fileId || '')
  && /^[a-f0-9]{64}$/.test(snapshot.sha256 || '') ? `${snapshot.fileId}:${snapshot.sha256}` : '';
const error = message => new Error(message);

async function boundedBlob(response, snapshot) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type) || (snapshot.mimeType && snapshot.mimeType !== type)) throw error('Only an exact PNG, JPEG or WebP preview can be displayed.');
  if (response.headers.get('x-image-sha256') !== snapshot.sha256) throw error('This image changed. Load and review the exact selection again.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_IMAGE_BYTES)) throw error('This image exceeds the private preview limit.');
  if (!response.body?.getReader) throw error('Private image preview is unavailable in this browser.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES || (declared !== null && size > Number(declared))) throw error('This image exceeds the private preview limit.');
      chunks.push(value);
    }
    if (!size || (declared !== null && size !== Number(declared)) || (snapshot.size !== undefined && size !== snapshot.size)) throw error('This image changed. Load and review the exact selection again.');
    return new Blob(chunks, { type });
  } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
  finally { reader.releaseLock(); }
}

// All media lives in transient browser memory. There is no URL credential,
// persistent cache, localStorage, IndexedDB, external image URL, or automatic
// approval. The authenticated endpoint is fixed and cannot be supplied by assets.
export function createImagePreviewController({ onState, fetchImpl = globalThis.fetch, urlImpl = globalThis.URL } = {}) {
  let generation = 0, controller = null, objectUrl = '', disposed = false, identity = '', timer = null;
  const emit = state => { if (!disposed) onState(state); };
  function cancel() {
    generation += 1;
    clearTimeout(timer); timer = null;
    controller?.abort(); controller = null;
    if (objectUrl) urlImpl.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
  function clear() { cancel(); identity = ''; emit({ identity: '', status: 'idle', url: '', message: '' }); }
  async function load(snapshot, requestConfig = {}) {
    if (disposed) return;
    cancel(); identity = previewIdentity(snapshot);
    const requestIdentity = identity, requestGeneration = generation;
    const current = () => !disposed && generation === requestGeneration;
    if (!identity) { emit({ identity, status: 'error', url: '', message: 'Select an exact Drive image before previewing it.' }); return; }
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => {
      if (!current()) return;
      cancel();
      emit({ identity: requestIdentity, status: 'error', url: '', message: 'The private image preview timed out. Try again.' });
    }, 60000);
    timer = timeout;
    emit({ identity, status: 'loading', url: '', message: '' });
    try {
      const response = await fetchImpl(`/api/content-factory/workspace/image-preview/${snapshot.fileId}?sha256=${snapshot.sha256}`, {
        method: 'GET', headers: { ...requestConfig.headers, Accept: 'image/png, image/jpeg, image/webp' },
        credentials: 'include', cache: 'no-store', redirect: 'error', mode: 'same-origin', referrerPolicy: 'no-referrer', signal,
      });
      if (!current()) { await response.body?.cancel?.().catch(() => {}); return; }
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        throw error(response.status === 401 ? 'Your session expired. Sign in again to preview this image.'
          : response.status === 409 ? 'This image changed or its private Drive access is unavailable. Load the exact selection again.'
            : 'The private image could not be loaded. Check its Drive access and try again.');
      }
      let blob;
      try { blob = await boundedBlob(response, snapshot); }
      catch (cause) { await response.body?.cancel?.().catch(() => {}); throw cause; }
      if (!current()) return;
      objectUrl = urlImpl.createObjectURL(blob);
      emit({ identity: requestIdentity, status: 'ready', url: objectUrl, message: '' });
    } catch (cause) {
      if (current()) emit({ identity: requestIdentity, status: 'error', url: '', message: cause.name === 'AbortError'
        ? 'The private image preview timed out. Try again.' : cause.message || 'The private image could not be loaded.' });
    } finally { clearTimeout(timeout); if (timer === timeout) timer = null; }
  }
  function imageFailed(failedIdentity, failedUrl) {
    if (disposed || failedIdentity !== identity || !objectUrl || failedUrl !== objectUrl) return;
    cancel(); emit({ identity, status: 'error', url: '', message: 'The browser could not display this original image. No replacement or transformation was made.' });
  }
  return { load, clear, imageFailed, dispose() { disposed = true; cancel(); } };
}
