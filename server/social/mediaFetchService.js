const { Readable } = require('stream');
const { assertAllowedHttpsUrl } = require('./mediaAssetService');

const DEFAULT_MAX_BYTES = 75 * 1024 * 1024;

const fetchMediaBuffer = async (asset, { maxBytes = DEFAULT_MAX_BYTES } = {}) => {
  if (!asset?.url) {
    const error = new Error('A hosted media URL is required.');
    error.statusCode = 400;
    throw error;
  }

  assertAllowedHttpsUrl(asset.url);

  const response = await fetch(asset.url);
  if (!response.ok) {
    const error = new Error(`Could not fetch hosted media asset (${response.status}).`);
    error.statusCode = 502;
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    const error = new Error('Hosted media asset exceeds the configured upload size limit.');
    error.statusCode = 413;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    const error = new Error('Hosted media asset exceeds the configured upload size limit.');
    error.statusCode = 413;
    throw error;
  }

  return {
    stream: Readable.from(Buffer.from(arrayBuffer)),
    mimeType: asset.mimeType || response.headers.get('content-type') || 'application/octet-stream',
    size: arrayBuffer.byteLength,
  };
};

module.exports = { fetchMediaBuffer, DEFAULT_MAX_BYTES };
