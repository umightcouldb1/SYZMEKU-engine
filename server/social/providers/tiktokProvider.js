const SocialProviderAdapter = require('./baseProvider');
const { requestJson } = require('./http');
const { findPostMediaAsset } = require('../mediaAssetService');

class TikTokProvider extends SocialProviderAdapter {
  get id() {
    return 'tiktok';
  }

  get displayName() {
    return 'TikTok';
  }

  get scopes() {
    return ['user.info.basic', 'video.publish', 'video.upload'];
  }

  get capabilities() {
    return {
      tiktok_user: {
        publishText: false,
        publishImage: true,
        publishVideo: true,
        schedulePost: false,
        analytics: false,
        approvalRequired: true,
        note: 'Direct publishing requires TikTok Content Posting API access, approved video.publish scope, verified media URL prefixes, and app audit for owner-operated production posting.',
      },
    };
  }

  getCredentials() {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;
    if (!clientKey || !clientSecret || !redirectUri) {
      const error = new Error('TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI.');
      error.statusCode = 503;
      throw error;
    }
    return { clientKey, clientSecret, redirectUri };
  }

  authorize({ state, codeChallenge }) {
    const { clientKey, redirectUri } = this.getCredentials();
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', clientKey);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.scopes.join(','));
    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  async handleCallback({ code, codeVerifier }) {
    const { clientKey, clientSecret, redirectUri } = this.getCredentials();
    return requestJson('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });
  }

  async refreshToken({ refreshToken }) {
    const { clientKey, clientSecret } = this.getCredentials();
    return requestJson('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
  }

  async getConnectedAccounts({ accessToken, refreshToken }) {
    const user = await requestJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = user.data?.user || {};
    return [{
      providerAccountId: info.open_id,
      accountName: info.display_name || 'TikTok Account',
      accountType: 'tiktok_user',
      accessToken,
      refreshToken,
      scopes: this.scopes,
      metadata: { avatarUrl: info.avatar_url || '', unionId: info.union_id || '' },
    }];
  }

  async publishVideo({ accessToken, post }) {
    const videoAsset = findPostMediaAsset(post, 'video');
    if (!videoAsset) throw new Error('TikTok direct post requires a hosted video URL from a verified domain or URL prefix.');
    return requestJson('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: [post.title || post.caption, post.hashtags?.join(' ')].filter(Boolean).join(' ').slice(0, 2200),
          privacy_level: post.metadata?.privacyLevel || process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE',
          disable_duet: Boolean(post.metadata?.disableDuet),
          disable_comment: Boolean(post.metadata?.disableComment),
          disable_stitch: Boolean(post.metadata?.disableStitch),
        },
        source_info: { source: 'PULL_FROM_URL', video_url: videoAsset.url },
      }),
    });
  }

  async publishImage({ accessToken, post }) {
    const images = (post.mediaAssets || []).filter((asset) => asset.type === 'image' && asset.url).map((asset) => asset.url);
    if (!images.length) throw new Error('TikTok photo publishing requires hosted image URLs from a verified domain or URL prefix.');
    return requestJson('https://open.tiktokapis.com/v2/post/publish/content/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: post.title || post.caption || 'SYZMEKU Social Command',
          description: [post.caption, post.hashtags?.join(' ')].filter(Boolean).join(' ').slice(0, 2200),
          privacy_level: post.metadata?.privacyLevel || 'SELF_ONLY',
          disable_comment: Boolean(post.metadata?.disableComment),
          auto_add_music: Boolean(post.metadata?.autoAddMusic),
        },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: images },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      }),
    });
  }

  async getPostStatus({ accessToken, publishId }) {
    return requestJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
  }

  async disconnect({ accessToken, refreshToken }) {
    const { clientKey, clientSecret } = this.getCredentials();
    const token = refreshToken || accessToken;
    if (!token) return { revoked: false, reason: 'No TikTok token was stored.' };
    await requestJson('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        token,
      }),
    });
    return { revoked: true };
  }
}

module.exports = TikTokProvider;
