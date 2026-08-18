const SocialProviderAdapter = require('./baseProvider');
const { requestJson } = require('./http');

class YouTubeProvider extends SocialProviderAdapter {
  get id() {
    return 'youtube';
  }

  get displayName() {
    return 'YouTube';
  }

  get scopes() {
    return [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ];
  }

  get capabilities() {
    return {
      youtube_channel: {
        publishText: false,
        publishImage: false,
        publishVideo: true,
        schedulePost: true,
        analytics: true,
        note: 'Shorts are normal uploads; YouTube classifies Shorts based on video format, duration, and eligibility.',
      },
    };
  }

  getCredentials() {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      const error = new Error('YouTube OAuth is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI.');
      error.statusCode = 503;
      throw error;
    }
    return { clientId, clientSecret, redirectUri };
  }

  authorize({ state, codeChallenge }) {
    const { clientId, redirectUri } = this.getCredentials();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.scopes.join(' '));
    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  async handleCallback({ code, codeVerifier }) {
    const { clientId, clientSecret, redirectUri } = this.getCredentials();
    return requestJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });
  }

  async refreshToken({ refreshToken }) {
    const { clientId, clientSecret } = this.getCredentials();
    return requestJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  }

  async getConnectedAccounts({ accessToken, refreshToken }) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'id,snippet');
    url.searchParams.set('mine', 'true');
    const channels = await requestJson(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return (channels.items || []).map((channel) => ({
      providerAccountId: channel.id,
      accountName: channel.snippet?.title || 'YouTube Channel',
      accountType: 'youtube_channel',
      accessToken,
      refreshToken,
      scopes: this.scopes,
      metadata: { thumbnails: channel.snippet?.thumbnails || {} },
    }));
  }

  async publishVideo({ accessToken, post }) {
    const videoAsset = post.mediaAssets?.find((asset) => asset.type === 'video' && asset.url);
    if (!videoAsset) {
      throw new Error('YouTube publishing requires a hosted video URL. Download/upload streaming is not enabled in this first module slice.');
    }

    const error = new Error('YouTube direct video upload requires server-side media streaming from configured storage. The adapter is ready for OAuth and metadata but needs media storage before upload is enabled.');
    error.statusCode = 501;
    error.details = { requiredScope: 'https://www.googleapis.com/auth/youtube.upload' };
    throw error;
  }

  async getAnalytics() {
    throw new Error('YouTube Analytics API reporting is not enabled in this module slice; store the video ID and refresh analytics after YouTube Analytics credentials/scopes are configured.');
  }

  async disconnect({ accessToken, refreshToken }) {
    const token = refreshToken || accessToken;
    if (!token) return { revoked: false, reason: 'No YouTube token was stored.' };
    await requestJson('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    return { revoked: true };
  }
}

module.exports = YouTubeProvider;
