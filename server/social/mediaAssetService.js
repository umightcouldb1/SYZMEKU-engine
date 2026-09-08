const net = require('net');

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^224\./,
  /^255\./,
];

const normalizeHost = (host = '') => String(host || '').toLowerCase().replace(/\.$/, '');

const configuredAllowedHosts = () => String(process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS || '')
  .split(',')
  .map((host) => normalizeHost(host.trim()))
  .filter(Boolean);

const assertAllowedHttpsUrl = (url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    const error = new Error('Social media assets must use HTTPS URLs.');
    error.statusCode = 400;
    throw error;
  }

  const host = normalizeHost(parsed.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    const error = new Error('Social media asset URLs must use a public hostname.');
    error.statusCode = 400;
    throw error;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(host))) {
    const error = new Error('Social media asset URLs cannot target private or reserved IP ranges.');
    error.statusCode = 400;
    throw error;
  }
  if (ipVersion === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) {
    const error = new Error('Social media asset URLs cannot target private or reserved IP ranges.');
    error.statusCode = 400;
    throw error;
  }

  const allowedHosts = configuredAllowedHosts();
  if (allowedHosts.length && !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    const error = new Error('Social media asset URL host is not in the configured allowlist.');
    error.statusCode = 400;
    throw error;
  }
};

const validateMediaAsset = (asset = {}) => {
  if (!asset.url && !asset.assetId) return null;
  if (asset.url) {
    assertAllowedHttpsUrl(asset.url);
  }
  return {
    assetId: String(asset.assetId || ''),
    url: String(asset.url || ''),
    type: ['image', 'video', 'link'].includes(asset.type) ? asset.type : 'unknown',
    mimeType: String(asset.mimeType || ''),
    altText: String(asset.altText || '').slice(0, 500),
    metadata: asset.metadata || {},
  };
};

const fallbackMediaAsset = (type) => {
  const url = process.env.SOCIAL_COMMAND_DEFAULT_VIDEO_URL || '';
  if (!url || type !== 'video') return null;
  assertAllowedHttpsUrl(url);
  return {
    assetId: 'default-freedom-audit-video',
    url,
    type: 'video',
    mimeType: 'video/mp4',
    altText: 'Freedom Audit launch campaign video',
    metadata: { source: 'SOCIAL_COMMAND_DEFAULT_VIDEO_URL' },
  };
};

const findPostMediaAsset = (post, type) => (
  post.mediaAssets?.find((asset) => asset.type === type && asset.url) || fallbackMediaAsset(type)
);

module.exports = { validateMediaAsset, assertAllowedHttpsUrl, findPostMediaAsset };
