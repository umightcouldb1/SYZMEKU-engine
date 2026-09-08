const SocialProviderAdapter = require('./baseProvider');
const { requestJson } = require('./http');
const { google } = require('googleapis');
const { fetchMediaBuffer } = require('../mediaFetchService');
const { findPostMediaAsset } = require('../mediaAssetService');

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
    const videoAsset = findPostMediaAsset(post, 'video');
    if (!videoAsset) {
      throw new Error('YouTube publishing requires a hosted video URL.');
    }

    const { stream, mimeType } = await fetchMediaBuffer(videoAsset, {
      maxBytes: Number(process.env.YOUTUBE_MAX_UPLOAD_BYTES || 75 * 1024 * 1024),
    });
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth });
    const description = [post.description || post.caption, post.link].filter(Boolean).join('\n\n');
    const tags = Array.isArray(post.hashtags)
      ? post.hashtags.map((tag) => String(tag || '').replace(/^#/, '')).filter(Boolean)
      : [];

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: post.title || 'SYZMEKU Social Command',
          description,
          tags,
          categoryId: post.metadata?.categoryId || '27',
        },
        status: {
          privacyStatus: post.metadata?.privacyStatus || process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS || 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: { mimeType, body: stream },
    });

    return {
      id: response.data?.id || '',
      url: response.data?.id ? `https://www.youtube.com/watch?v=${response.data.id}` : '',
      data: response.data,
    };
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
