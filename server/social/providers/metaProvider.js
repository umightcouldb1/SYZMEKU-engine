const SocialProviderAdapter = require('./baseProvider');
const { requestJson } = require('./http');
const { findPostMediaAsset } = require('../mediaAssetService');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

class MetaProvider extends SocialProviderAdapter {
  get id() {
    return 'meta';
  }

  get displayName() {
    return 'Meta / Facebook + Instagram';
  }

  get scopes() {
    return [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'business_management',
      'instagram_basic',
      'instagram_content_publish',
    ];
  }

  get capabilities() {
    return {
      facebook_page: {
        publishText: true,
        publishImage: true,
        publishVideo: false,
        schedulePost: true,
        analytics: true,
      },
      instagram_professional: {
        publishText: false,
        publishImage: true,
        publishVideo: true,
        schedulePost: false,
        analytics: false,
        note: 'Instagram publishing requires a Professional account linked to a Facebook Page. Stories and some media types depend on account eligibility.',
      },
    };
  }

  getCredentials() {
    const clientId = process.env.META_APP_ID;
    const clientSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      const error = new Error('Meta OAuth is not configured. Set META_APP_ID, META_APP_SECRET, and META_REDIRECT_URI.');
      error.statusCode = 503;
      throw error;
    }
    return { clientId, clientSecret, redirectUri };
  }

  authorize({ state }) {
    const { clientId, redirectUri } = this.getCredentials();
    const url = new URL('https://www.facebook.com/dialog/oauth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('auth_type', 'rerequest');
    url.searchParams.set('scope', this.scopes.join(','));
    return url.toString();
  }

  async handleCallback({ code }) {
    const { clientId, clientSecret, redirectUri } = this.getCredentials();
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);
    const shortToken = await requestJson(tokenUrl.toString());

    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', clientId);
    longUrl.searchParams.set('client_secret', clientSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken.access_token);
    return requestJson(longUrl.toString());
  }

  mapPageConnection(page, accessToken, metadata = {}) {
    const connections = [{
      providerAccountId: page.id,
      accountName: page.name,
      accountType: 'facebook_page',
      accessToken: page.access_token || accessToken,
      refreshToken: '',
      scopes: this.scopes,
      metadata: {
        category: page.category || '',
        tasks: page.tasks || [],
        ...metadata,
      },
    }];

    if (page.instagram_business_account?.id || page.connected_instagram_account?.id) {
      const instagram = page.instagram_business_account || page.connected_instagram_account;
      connections.push({
        providerAccountId: instagram.id,
        accountName: instagram.username || instagram.name || page.name,
        accountType: 'instagram_professional',
        accessToken: page.access_token || accessToken,
        refreshToken: '',
        scopes: this.scopes,
        metadata: {
          linkedPageId: page.id,
          linkedPageName: page.name,
          username: instagram.username || '',
          ...metadata,
        },
      });
    }

    return connections;
  }

  async getBusinessManagedPages({ accessToken }) {
    const businessUrl = new URL(`${GRAPH_BASE}/me/businesses`);
    businessUrl.searchParams.set(
      'fields',
      [
        'id',
        'name',
        'owned_pages.limit(100){id,name,access_token,category,tasks,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}}',
        'client_pages.limit(100){id,name,access_token,category,tasks,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}}',
      ].join(',')
    );
    businessUrl.searchParams.set('access_token', accessToken);

    const businesses = await requestJson(businessUrl.toString()).catch(() => ({ data: [] }));
    const pages = [];
    for (const business of businesses.data || []) {
      for (const source of ['owned_pages', 'client_pages']) {
        for (const page of business[source]?.data || []) {
          pages.push({
            ...page,
            metadata: {
              businessId: business.id,
              businessName: business.name,
              businessPageSource: source,
            },
          });
        }
      }
    }
    return pages;
  }

  async getConnectedAccounts({ accessToken }) {
    const url = new URL(`${GRAPH_BASE}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token,category,tasks,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}');
    url.searchParams.set('access_token', accessToken);
    const pages = await requestJson(url.toString());
    const accounts = [];
    const seen = new Set();

    const addPage = (page, metadata = {}) => {
      for (const account of this.mapPageConnection(page, accessToken, metadata)) {
        const key = `${account.accountType}:${account.providerAccountId}`;
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push(account);
        }
      }
    };

    for (const page of pages.data || []) {
      addPage(page);
    }

    for (const page of await this.getBusinessManagedPages({ accessToken })) {
      addPage(page, page.metadata || {});
    }

    return accounts;
  }

  async publishText({ connection, accessToken, post }) {
    if (connection.accountType !== 'facebook_page') {
      throw new Error('Meta text publishing is only supported for Facebook Pages.');
    }
    const body = new URLSearchParams({
      message: [post.caption, post.link].filter(Boolean).join('\n\n'),
      access_token: accessToken,
    });
    return requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/feed`, { method: 'POST', body });
  }

  async publishImage({ connection, accessToken, post }) {
    if (connection.accountType === 'facebook_page') {
      const imageUrl = post.mediaAssets?.find((asset) => asset.type === 'image' && asset.url)?.url;
      if (!imageUrl) throw new Error('Facebook image publishing requires a hosted image URL.');
      const body = new URLSearchParams({
        url: imageUrl,
        caption: [post.caption, post.link].filter(Boolean).join('\n\n'),
        access_token: accessToken,
      });
      return requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/photos`, { method: 'POST', body });
    }

    if (connection.accountType === 'instagram_professional') {
      const imageUrl = post.mediaAssets?.find((asset) => asset.type === 'image' && asset.url)?.url;
      if (!imageUrl) throw new Error('Instagram publishing requires a publicly reachable HTTPS image URL.');
      const container = await requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imageUrl,
          caption: require('../contentMetadata').captionWithTags(post.caption, post.hashtags),
          access_token: accessToken,
        }),
      });
      return requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/media_publish`, {
        method: 'POST',
        body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
      });
    }

    throw new Error('Unsupported Meta account type.');
  }

  async publishVideo({ connection, accessToken, post }) {
    const videoAsset = findPostMediaAsset(post, 'video');
    const videoUrl = videoAsset?.url;
    if (!videoUrl) throw new Error('Meta video publishing requires a hosted video URL.');

    if (connection.accountType === 'facebook_page') {
      const body = new URLSearchParams({
        file_url: videoUrl,
        title: post.title || '',
        description: [require('../contentMetadata').captionWithTags(post.caption, post.hashtags), post.link].filter(Boolean).join('\n\n'),
        access_token: accessToken,
      });
      return requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/videos`, { method: 'POST', body });
    }

    if (connection.accountType === 'instagram_professional') {
      const container = await requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'REELS',
          video_url: videoUrl,
          caption: require('../contentMetadata').captionWithTags(post.caption, post.hashtags),
          share_to_feed: String(post.metadata?.shareToFeed ?? true),
          access_token: accessToken,
        }),
      });

      let processingFinished = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await requestJson(`${GRAPH_BASE}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
        if (status.status_code === 'FINISHED') {
          processingFinished = true;
          break;
        }
        if (['ERROR', 'EXPIRED'].includes(status.status_code)) {
          throw new Error(status.status || `Instagram reel processing failed with ${status.status_code}.`);
        }
      }
      if (!processingFinished) {
        throw new Error('Instagram reel processing did not finish before the publish timeout.');
      }

      return requestJson(`${GRAPH_BASE}/${connection.providerAccountId}/media_publish`, {
        method: 'POST',
        body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
      });
    }

    throw new Error('Unsupported Meta account type.');
  }

  async schedulePost() {
    throw new Error('Meta scheduling is stored in SYZMEKU and published by the scheduler at the scheduled time.');
  }

  async getAnalytics({ connection, accessToken, post }) {
    const metric = connection.accountType === 'instagram_professional'
      ? 'impressions,reach,likes,comments,saved,shares'
      : 'post_impressions,post_impressions_unique,post_clicks,post_reactions_like_total,post_comments,post_shares';
    const url = new URL(`${GRAPH_BASE}/${post.providerPostId}/insights`);
    url.searchParams.set('metric', metric);
    url.searchParams.set('access_token', accessToken);
    return requestJson(url.toString());
  }

  async disconnect({ accessToken }) {
    if (!accessToken) return { revoked: false, reason: 'No Meta access token was stored.' };
    await requestJson(`${GRAPH_BASE}/me/permissions`, {
      method: 'DELETE',
      body: new URLSearchParams({ access_token: accessToken }),
    });
    return { revoked: true };
  }
}

module.exports = MetaProvider;
