const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { assertAllowedHttpsUrl, isPublicIpAddress } = require('../social/mediaAssetService');
const { fetchMediaBuffer, HARD_MAX_BYTES } = require('../social/mediaFetchService');

const originalAllowlist = process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
  else process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS = originalAllowlist;
});

function network(t, { addresses = [{ address: '93.184.216.34', family: 4 }], status = 200, headers = {}, chunks = [Buffer.from('media')], stall = false, dnsStall = false } = {}) {
  let dnsCalls = 0;
  const calls = [];
  t.mock.method(dns, 'lookup', (_hostname, options, callback) => {
    dnsCalls += 1;
    assert.equal(options.all, true);
    if (!dnsStall) queueMicrotask(() => callback(null, addresses));
  });
  t.mock.method(https, 'get', (url, options, onResponse) => {
    const request = new EventEmitter();
    request.destroyed = false;
    request.destroy = () => { request.destroyed = true; return request; };
    const response = new PassThrough();
    response.statusCode = status;
    response.headers = headers;
    calls.push({ url, options, request, response });
    options.signal.addEventListener('abort', () => request.emit('error', options.signal.reason), { once: true });
    queueMicrotask(() => {
      // Exercise both lookup callback shapes used by Node's TLS connector.
      options.lookup(url.hostname, {}, (err, address, family) => {
        assert.ifError(err); assert.deepEqual({ address, family }, addresses[0]);
      });
      options.lookup(url.hostname, { all: true }, (err, pinned) => {
        assert.ifError(err); assert.deepEqual(pinned, [addresses[0]]);
      });
      onResponse(response);
      if (!stall) {
        for (const chunk of chunks) { if (response.destroyed) break; response.write(chunk); }
        if (!response.destroyed) response.end();
      }
    });
    return request;
  });
  return { calls, get dnsCalls() { return dnsCalls; } };
}

for (const host of [
  '127.0.0.1', '2130706433', '0x7f000001', '10.0.0.1', '172.16.2.1', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '198.18.0.1', '198.51.100.2', '224.9.0.1', '239.0.0.1', '240.0.0.1',
  '[::1]', '[::]', '[::ffff:127.0.0.1]', '[::ffff:8.8.8.8]', '[fe80::1]', '[fd00::1]', '[ff02::1]',
  '[64:ff9b::a00:1]', '[2002:7f00:1::]', '[2001:db8::1]', '[3fff::1]',
]) {
  test(`rejects private, special, or encoded address ${host}`, () => {
    delete process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
    assert.throws(() => assertAllowedHttpsUrl(`https://${host}/video.mp4`), { statusCode: 400 });
  });
}

test('allows public IPv4/IPv6 and enforces credentials, port, hostname, protocol and allowlist rules', () => {
  delete process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS;
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert(isPublicIpAddress(address));
  assertAllowedHttpsUrl('https://[2606:4700:4700::1111]/video.mp4');
  for (const url of ['not-a-url', 'http://cdn.example.com/a', 'https://localhost/a', 'https://foo.local/a', 'https://user:pass@example.com/a', 'https://example.com:8443/a']) {
    assert.throws(() => assertAllowedHttpsUrl(url), { statusCode: 400 });
  }
  process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS = 'assets.example.com';
  assertAllowedHttpsUrl('https://cdn.assets.example.com/a');
  assert.throws(() => assertAllowedHttpsUrl('https://assets.example.com.attacker.test/a'), /allowlist/);
});

for (const addresses of [
  [{ address: '127.0.0.1', family: 4 }],
  [{ address: '::ffff:127.0.0.1', family: 6 }],
  [{ address: '169.254.169.254', family: 4 }],
  [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
  [{ address: '93.184.216.34', family: 6 }],
]) {
  test(`rejects unsafe or inconsistent DNS before connecting: ${JSON.stringify(addresses)}`, async (t) => {
    const n = network(t, { addresses });
    await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }), { statusCode: 400 });
    assert.equal(n.calls.length, 0);
  });
}

test('pins one validated DNS result, retains TLS hostname, streams exact bytes within bounds', async (t) => {
  const n = network(t, { chunks: [Buffer.from('ab'), Buffer.from('cd')], headers: { 'content-type': 'video/mp4' } });
  const asset = await fetchMediaBuffer({ url: 'https://cdn.example.com/a' }, { maxBytes: 4 });
  assert.equal(n.dnsCalls, 1);
  assert.equal(n.calls.length, 1);
  assert.equal(n.calls[0].url.hostname, 'cdn.example.com');
  assert.equal(n.calls[0].options.agent, false);
  assert.equal(n.calls[0].options.rejectUnauthorized, undefined);
  const chunks = []; for await (const chunk of asset.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'abcd');
  assert.equal(asset.size, 4); assert.equal(asset.mimeType, 'video/mp4');
});

test('public IP literals are checked without DNS', async (t) => {
  const n = network(t);
  await fetchMediaBuffer({ url: 'https://93.184.216.34/a' });
  assert.equal(n.dnsCalls, 0); assert.equal(n.calls.length, 1);
});

test('coalesces tiny chunks and preserves bytes across buffer boundaries', async (t) => {
  const bytes = Buffer.alloc(65_537, 97);
  const input = [...Array(5)].map(() => bytes.subarray(0, 1));
  input.push(bytes);
  network(t, { chunks: input });
  const asset = await fetchMediaBuffer({ url: 'https://cdn.example.com/a' });
  const output = [];
  for await (const chunk of asset.stream) output.push(chunk);
  assert.equal(output.length, 2);
  assert.deepEqual(Buffer.concat(output), Buffer.concat(input));
  assert.equal(asset.size, 65_542);
});

test('failed or empty DNS resolution never opens a connection', async (t) => {
  const n = network(t, { addresses: [] });
  await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }), { statusCode: 502 });
  assert.equal(n.calls.length, 0);
});

for (const location of ['https://127.0.0.1/a', 'https://cdn.example.com/other', 'https://attacker.test/a']) {
  test(`does not follow redirects to ${location}`, async (t) => {
    const n = network(t, { status: 302, headers: { location } });
    await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }), { statusCode: 502 });
    assert.equal(n.calls.length, 1); assert(n.calls[0].request.destroyed); assert(n.calls[0].response.destroyed);
  });
}

for (const headers of [{}, { 'content-length': '2' }, { 'content-length': '100' }]) {
  test(`cancels oversized response with header ${JSON.stringify(headers)}`, async (t) => {
    const n = network(t, { headers, chunks: [Buffer.alloc(3), Buffer.alloc(3), Buffer.alloc(100)] });
    await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }, { maxBytes: 4 }), { statusCode: 413 });
    assert(n.calls[0].request.destroyed); assert(n.calls[0].response.destroyed);
  });
}

test('rejects compressed responses before buffering', async (t) => {
  const n = network(t, { headers: { 'content-encoding': 'gzip' } });
  await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }), { statusCode: 502 });
  assert(n.calls[0].response.destroyed);
});

test('deadline covers stalled response body and destroys connection', async (t) => {
  const n = network(t, { stall: true });
  await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }, { timeoutMs: 20 }), { statusCode: 504 });
  assert(n.calls[0].request.destroyed); assert(n.calls[0].response.destroyed);
});

test('deadline covers DNS resolution before any connection', async (t) => {
  const n = network(t, { dnsStall: true });
  await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }, { timeoutMs: 20 }), { statusCode: 504 });
  assert.equal(n.calls.length, 0);
});

test('invalid limits fail closed without a request', async (t) => {
  const n = network(t);
  for (const maxBytes of [0, NaN, Infinity, -1, 0.5, HARD_MAX_BYTES + 1]) {
    await assert.rejects(fetchMediaBuffer({ url: 'https://cdn.example.com/a' }, { maxBytes }), { statusCode: 500 });
  }
  assert.equal(n.dnsCalls, 0); assert.equal(n.calls.length, 0);
});
