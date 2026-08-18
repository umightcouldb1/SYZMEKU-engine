class SocialProviderAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  get id() {
    throw new Error('Provider id is required.');
  }

  get displayName() {
    return this.id;
  }

  get scopes() {
    return [];
  }

  get capabilities() {
    return {};
  }

  authorize() {
    throw new Error(`${this.id} authorization is not implemented.`);
  }

  handleCallback() {
    throw new Error(`${this.id} OAuth callback is not implemented.`);
  }

  refreshToken() {
    throw new Error(`${this.id} token refresh is not implemented.`);
  }

  getConnectedAccounts() {
    throw new Error(`${this.id} account discovery is not implemented.`);
  }

  publishText() {
    throw new Error(`${this.id} text publishing is not supported.`);
  }

  publishImage() {
    throw new Error(`${this.id} image publishing is not supported.`);
  }

  publishVideo() {
    throw new Error(`${this.id} video publishing is not supported.`);
  }

  schedulePost() {
    throw new Error(`${this.id} scheduling is not supported through this adapter.`);
  }

  getPostStatus() {
    throw new Error(`${this.id} post status retrieval is not supported.`);
  }

  getAnalytics() {
    throw new Error(`${this.id} analytics retrieval is not supported.`);
  }

  disconnect() {
    return { revoked: false, reason: 'Provider revocation endpoint not configured.' };
  }
}

module.exports = SocialProviderAdapter;
