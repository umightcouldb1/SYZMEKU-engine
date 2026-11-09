const net = require('net');

const blockedIpv4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedIpv4.addSubnet(address, prefix, 'ipv4');

// Restrict IPv6 to global unicast. This also rejects IPv4-mapped addresses,
// unique/link-local addresses, multicast, and translation-only prefixes.
const globalIpv6 = new net.BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const blockedIpv6 = new net.BlockList();
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]) blockedIpv6.addSubnet(address, prefix, 'ipv6');

const normalizeHost = (host = '') => String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

const isPublicIpAddress = (address) => {
  const version = net.isIP(address);
  if (version === 4) return !blockedIpv4.check(address, 'ipv4');
  if (version === 6) return globalIpv6.check(address, 'ipv6') && !blockedIpv6.check(address, 'ipv6');
  return false;
};

const invalidAssetUrl = (message) => Object.assign(new Error(message), { statusCode: 400 });

const configuredAllowedHosts = () => String(process.env.SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS || '')
  .split(',')
  .map((host) => normalizeHost(host.trim()))
  .filter(Boolean);

const assertAllowedHttpsUrl = (url) => {
  let parsed;
  try {
    if (typeof url !== 'string' || url.length > 4096) throw new Error('Invalid URL');
    parsed = new URL(url);
  } catch {
    throw invalidAssetUrl('A valid hosted media URL is required.');
  }
  if (parsed.protocol !== 'https:') {
    const error = new Error('Social media assets must use HTTPS URLs.');
    error.statusCode = 400;
    throw error;
  }

  if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw invalidAssetUrl('Social media asset URLs cannot include credentials or a non-HTTPS port.');
  }

  const host = normalizeHost(parsed.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    const error = new Error('Social media asset URLs must use a public hostname.');
    error.statusCode = 400;
    throw error;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion && !isPublicIpAddress(host)) {
    throw invalidAssetUrl('Social media asset URLs cannot target private or reserved IP ranges.');
  }

  const allowedHosts = configuredAllowedHosts();
  if (allowedHosts.length && !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    const error = new Error('Social media asset URL host is not in the configured allowlist.');
    error.statusCode = 400;
    throw error;
  }
  return parsed;
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

module.exports = { validateMediaAsset, assertAllowedHttpsUrl, findPostMediaAsset, isPublicIpAddress };
