const MetaProvider = require('./metaProvider');
const YouTubeProvider = require('./youtubeProvider');
const TikTokProvider = require('./tiktokProvider');

const providers = {
  meta: new MetaProvider(),
  youtube: new YouTubeProvider(),
  tiktok: new TikTokProvider(),
};

const getProvider = (provider) => {
  const adapter = providers[provider];
  if (!adapter) {
    const error = new Error(`Unsupported social provider: ${provider}`);
    error.statusCode = 404;
    throw error;
  }
  return adapter;
};

const listProviders = () => Object.values(providers).map((provider) => ({
  id: provider.id,
  displayName: provider.displayName,
  scopes: provider.scopes,
  capabilities: provider.capabilities,
}));

module.exports = { getProvider, listProviders };
