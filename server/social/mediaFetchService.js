const dns = require('node:dns');
const https = require('node:https');
const net = require('node:net');
const { Readable } = require('node:stream');
const { assertAllowedHttpsUrl, isPublicIpAddress } = require('./mediaAssetService');

const DEFAULT_MAX_BYTES = 75 * 1024 * 1024;
const HARD_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const mediaError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const resolvePublicAddress = (hostname, signal) => new Promise((resolve, reject) => {
  const onAbort = () => reject(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  const complete = (error, addresses) => {
    signal.removeEventListener('abort', onAbort);
    if (signal.aborted) return reject(signal.reason);
    if (error || !addresses?.length) {
      return reject(mediaError('Could not resolve the hosted media asset.', 502));
    }
    // Reject mixed public/private answers rather than relying on DNS ordering.
    if (addresses.some(({ address, family }) => !isPublicIpAddress(address) || net.isIP(address) !== family)) {
      return reject(mediaError('Social media asset URLs cannot target private or reserved IP ranges.', 400));
    }
    return resolve(addresses[0]);
  };
  if (net.isIP(hostname)) return complete(null, [{ address: hostname, family: net.isIP(hostname) }]);
  dns.lookup(hostname, { all: true, verbatim: true }, complete);
});

const downloadMedia = (url, address, { maxBytes, signal }) => new Promise((resolve, reject) => {
  let response;
  let settled = false;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    response?.destroy();
    request.destroy();
    reject(signal.aborted ? signal.reason : error);
  };
  const request = https.get(url, {
    agent: false,
    signal,
    // Preserve the original TLS name/Host, but connect only to the address
    // already checked above. Never perform a second, rebindable DNS lookup.
    lookup: (_host, options, callback) => {
      if (options?.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    },
    headers: { 'Accept-Encoding': 'identity' },
  }, (incoming) => {
    response = incoming;
    incoming.on('error', fail);
    // Node HTTPS does not follow redirects. Reject every non-success response,
    // including redirects to another host, so it cannot bypass URL/DNS checks.
    if (incoming.statusCode < 200 || incoming.statusCode >= 300) {
      return fail(mediaError(`Could not fetch hosted media asset (${incoming.statusCode}). Redirects are not allowed.`, 502));
    }
    const contentLength = Number(incoming.headers['content-length'] || 0);
    const tooLarge = () => mediaError('Hosted media asset exceeds the configured upload size limit.', 413);
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxBytes) {
      return fail(tooLarge());
    }
    if (incoming.headers['content-encoding'] && incoming.headers['content-encoding'] !== 'identity') {
      return fail(mediaError('Hosted media assets must not use HTTP compression.', 502));
    }
    let size = 0;
    const chunks = [];
    let pending;
    let pendingSize = 0;
    incoming.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) return fail(tooLarge());
      // Coalesce tiny network chunks so chunk/object overhead is bounded too.
      let offset = 0;
      while (offset < chunk.length) {
        pending ||= Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes));
        const copied = chunk.copy(pending, pendingSize, offset, offset + pending.length - pendingSize);
        pendingSize += copied;
        offset += copied;
        if (pendingSize === pending.length) {
          chunks.push(pending);
          pending = undefined;
          pendingSize = 0;
        }
      }
    });
    incoming.on('end', () => {
      if (settled) return;
      settled = true;
      if (pendingSize) chunks.push(pending.subarray(0, pendingSize));
      resolve({ chunks, size, contentType: incoming.headers['content-type'] });
    });
  });
  request.on('error', fail);
});

const fetchMediaBuffer = async (asset, { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  if (!asset?.url) throw mediaError('A hosted media URL is required.', 400);
  const url = assertAllowedHttpsUrl(asset.url);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > HARD_MAX_BYTES
      || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > DEFAULT_TIMEOUT_MS) {
    throw mediaError('Hosted media download limits are not configured safely.', 500);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(mediaError('Hosted media download timed out.', 504)), timeoutMs);
  try {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const address = await resolvePublicAddress(hostname, controller.signal);
    const { chunks, size, contentType } = await downloadMedia(url, address, { maxBytes, signal: controller.signal });
    return {
      // Keep bounded chunks rather than making another full-size buffer copy.
      stream: Readable.from(chunks),
      mimeType: asset.mimeType || contentType || 'application/octet-stream',
      size,
    };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { fetchMediaBuffer, DEFAULT_MAX_BYTES, HARD_MAX_BYTES, DEFAULT_TIMEOUT_MS };
