const validateMediaAsset = (asset = {}) => {
  if (!asset.url && !asset.assetId) return null;
  if (asset.url) {
    const parsed = new URL(asset.url);
    if (parsed.protocol !== 'https:') {
      const error = new Error('Social media assets must use HTTPS URLs.');
      error.statusCode = 400;
      throw error;
    }
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

module.exports = { validateMediaAsset };
