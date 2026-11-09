'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const modulePromise = import(pathToFileURL(path.resolve(__dirname, '../../client/src/privateImagePreview.js')));
const snapshot = { fileId: 'synthetic_image_123456', sha256: 'a'.repeat(64), mimeType: 'image/png', size: 4 };
function response(patch = {}) { return new Response(patch.bytes || new Uint8Array([1, 2, 3, 4]), { status: patch.status || 200, headers: { 'Content-Type': 'image/png', 'Content-Length': '4', 'X-Image-SHA256': snapshot.sha256, ...patch.headers } }); }
async function fixture(fetchOverride) {
  const { createImagePreviewController } = await modulePromise;
  const states = [], calls = [], created = [], revoked = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return fetchOverride ? fetchOverride(url, options) : response(); };
  const controller = createImagePreviewController({ onState: state => states.push(state), fetchImpl,
    urlImpl: { createObjectURL(blob) { created.push(blob); return `blob:private-test-${created.length}`; }, revokeObjectURL(url) { revoked.push(url); } } });
  return { controller, states, calls, created, revoked };
}

test('does not eagerly fetch; exact selected preview uses header authentication and no persistent cache', async () => {
  const f = await fixture(); assert.equal(f.calls.length, 0);
  await f.controller.load(snapshot, { headers: { Authorization: 'Bearer synthetic-app-token' } });
  assert.equal(f.calls.length, 1); const { url, options } = f.calls[0];
  assert.equal(url, `/api/content-factory/workspace/image-preview/${snapshot.fileId}?sha256=${snapshot.sha256}`);
  assert(!url.includes('token')); assert.equal(options.headers.Authorization, 'Bearer synthetic-app-token');
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store');
  assert.equal(options.mode, 'same-origin'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer');
  assert.deepEqual(f.states.map(state => state.status), ['loading', 'ready']); assert.equal(f.created.length, 1);
  assert.deepEqual(new Uint8Array(await f.created[0].arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  assert.equal(f.created[0].type, 'image/png'); f.controller.dispose(); assert.deepEqual(f.revoked, ['blob:private-test-1']);
});

test('changing selection cancels and revokes old preview before displaying the new one', async () => {
  const f = await fixture(); await f.controller.load(snapshot);
  const oldSignal = f.calls[0].options.signal;
  await f.controller.load({ ...snapshot, fileId: 'different_image_12345' });
  assert(oldSignal.aborted); assert.deepEqual(f.revoked, ['blob:private-test-1']);
  assert(f.states.at(-1).identity.startsWith('different_image_12345:')); assert.equal(f.states.at(-1).url, 'blob:private-test-2');
  f.controller.dispose(); assert.deepEqual(f.revoked, ['blob:private-test-1', 'blob:private-test-2']);
});

test('out-of-order stale fetch response cannot replace the newer exact image', async () => {
  let finishOld;
  const f = await fixture(url => url.includes('different_image') ? response() : new Promise(resolve => { finishOld = resolve; }));
  const old = f.controller.load(snapshot);
  await f.controller.load({ ...snapshot, fileId: 'different_image_12345' });
  finishOld(response()); await old;
  assert.equal(f.created.length, 1); assert(f.states.at(-1).identity.startsWith('different_image_12345:'));
  assert.equal(f.states.filter(state => state.status === 'ready').length, 1); f.controller.dispose();
});

test('closing panel/unmount discards delayed response even if fetch ignores abort', async () => {
  for (const action of ['clear', 'dispose']) {
    let finish;
    const f = await fixture(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.controller.load(snapshot); f.controller[action](); const stateCount = f.states.length;
    assert(f.calls[0].options.signal.aborted); finish(response()); await pending;
    assert.equal(f.created.length, 0); assert.equal(f.states.length, stateCount); f.controller.dispose();
  }
});

test('stale streaming completion cannot create an ObjectURL after selection changes', async () => {
  let finishStream;
  const f = await fixture(url => url.includes('different_image') ? response() : new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); finishStream = () => { controller.enqueue(new Uint8Array([3, 4])); controller.close(); }; } }), { headers: { 'Content-Type': 'image/png', 'Content-Length': '4', 'X-Image-SHA256': snapshot.sha256 } }));
  const old = f.controller.load(snapshot); await new Promise(resolve => setImmediate(resolve));
  await f.controller.load({ ...snapshot, fileId: 'different_image_12345' }); finishStream(); await old;
  assert.equal(f.created.length, 1); assert(f.states.at(-1).identity.startsWith('different_image_12345:')); f.controller.dispose();
});

test('invalid identity, mismatched type/hash/size, errors and oversized body never become an image', async () => {
  const invalid = await fixture(); await invalid.controller.load({ ...snapshot, sha256: 'not-a-hash' }); assert.equal(invalid.calls.length, 0); invalid.controller.dispose();
  for (const patch of [
    { status: 401 }, { status: 409 }, { status: 500 }, { headers: { 'Content-Type': 'image/svg+xml' } },
    { headers: { 'X-Image-SHA256': 'b'.repeat(64) } }, { headers: { 'Content-Length': String(25 * 1024 * 1024 + 1) } },
    { headers: { 'Content-Length': '5' } }, { bytes: new Uint8Array(5) }, { bytes: new Uint8Array(3) },
  ]) {
    const f = await fixture(() => response(patch)); await f.controller.load(snapshot);
    assert.equal(f.states.at(-1).status, 'error'); assert.equal(f.states.at(-1).url, ''); assert.equal(f.created.length, 0); f.controller.dispose();
  }
});

test('retry is explicit and image decode failure revokes bytes without changing approval state', async () => {
  let count = 0; const f = await fixture(() => ++count === 1 ? response({ status: 409 }) : response());
  await f.controller.load(snapshot); assert.equal(f.calls.length, 1); assert.equal(f.states.at(-1).status, 'error');
  await f.controller.load(snapshot); assert.equal(f.calls.length, 2); assert.equal(f.states.at(-1).status, 'ready');
  f.controller.imageFailed('old-selection', f.states.at(-1).url); assert.equal(f.states.at(-1).status, 'ready');
  f.controller.imageFailed(f.states.at(-1).identity, 'blob:stale-retry-url'); assert.equal(f.states.at(-1).status, 'ready');
  f.controller.imageFailed(f.states.at(-1).identity, f.states.at(-1).url); assert.equal(f.states.at(-1).status, 'error'); assert.deepEqual(f.revoked, ['blob:private-test-1']);
  f.controller.dispose(); await f.controller.load(snapshot); assert.equal(f.calls.length, 2);
});

test('component compiles, defaults to disabled, and retains an accessible selected-image loading state', async () => {
  const client = path.resolve(__dirname, '../../client'), esbuild = require(path.join(client, 'node_modules/esbuild'));
  const result = esbuild.buildSync({ entryPoints: [path.join(client, 'src/ImagePreview.jsx')], bundle: true, write: false, platform: 'node', format: 'cjs', loader: { '.css': 'empty' }, external: ['react'] });
  const Module = require('node:module'), filename = path.join(client, 'preview-test.cjs'), output = new Module(filename); output.filename = filename; output.paths = Module._nodeModulePaths(client); output._compile(result.outputFiles[0].text, filename);
  const React = require(path.join(client, 'node_modules/react')), { renderToStaticMarkup } = require(path.join(client, 'node_modules/react-dom/server'));
  const ImagePreview = output.exports.default;
  assert.equal(renderToStaticMarkup(React.createElement(ImagePreview, { snapshot })), '');
  const html = renderToStaticMarkup(React.createElement(ImagePreview, { snapshot, enabled: true, label: 'Scene 1' }));
  assert.match(html, /Loading the exact private Drive image/); assert.match(html, /aria-busy="true"/); assert(!html.includes('<img')); assert(!html.includes('checked'));
  const css = fs.readFileSync(path.join(client, 'src/imagePreview.css'), 'utf8'); assert.match(css, /object-fit:\s*contain/);
  const source = fs.readFileSync(path.join(client, 'src/ImagePreview.jsx'), 'utf8'); assert.match(source, /state\.identity === identity/); assert.match(source, /current\.dispose\(\)/);
});
