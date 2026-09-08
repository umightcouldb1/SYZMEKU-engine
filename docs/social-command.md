# SYZMEKU Social Command

SYZMEKU Social Command is a private Big SYZ operator module for preparing, approving, scheduling, publishing, and reviewing social campaigns through official provider APIs. It is mounted at `/app/social-command` in the client and `/api/social-command` in the server.

Social Command is not a public customer product. It is restricted to the founder/operator account with the `COMMANDER_IN_CHIEF` role. Public users and ordinary authenticated accounts must not be able to load the dashboard, connect accounts, create campaigns, approve posts, schedule posts, publish posts, or run the scheduler.

The module does not scrape, automate browsers, store provider tokens in the frontend, or replace the existing SYZMEKU/Freedom Audit production applications.

## Local Development

1. Install dependencies from the repository root:

```bash
npm install
npm install --prefix client
```

2. Copy `.env.example` to a local env file and set the social variables listed below.

3. Run the app:

```bash
npm run dev
```

4. Open the authenticated client at `http://localhost:5173/app/social-command` while signed in as the configured founder/operator account.

## Backend Environment Variables

`SOCIAL_TOKEN_ENCRYPTION_KEY` is required before any OAuth callback can persist tokens. Use a 32-byte base64 key, a 64-character hex key, or a long random passphrase. The server derives a 256-bit encryption key when a passphrase is used.

```bash
SOCIAL_TOKEN_ENCRYPTION_KEY=<32-byte-base64-or-long-random-passphrase>
META_APP_ID=<meta-app-id>
META_APP_SECRET=<meta-app-secret>
META_REDIRECT_URI=https://syzmeku-api.onrender.com/api/social-command/oauth/meta/callback
META_GRAPH_VERSION=v24.0
YOUTUBE_CLIENT_ID=<google-oauth-client-id>
YOUTUBE_CLIENT_SECRET=<google-oauth-client-secret>
YOUTUBE_REDIRECT_URI=https://syzmeku-api.onrender.com/api/social-command/oauth/youtube/callback
TIKTOK_CLIENT_KEY=<tiktok-client-key>
TIKTOK_CLIENT_SECRET=<tiktok-client-secret>
TIKTOK_REDIRECT_URI=https://syzmeku-api.onrender.com/api/social-command/oauth/tiktok/callback
SOCIAL_COMMAND_APP_URL=https://www.toisouljahacademy.com/app/social-command
SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS=<optional-comma-separated-public-media-hosts>
```

Local callback URLs:

```text
http://localhost:5000/api/social-command/oauth/meta/callback
http://localhost:5000/api/social-command/oauth/youtube/callback
http://localhost:5000/api/social-command/oauth/tiktok/callback
```

Production callback URLs:

```text
https://syzmeku-api.onrender.com/api/social-command/oauth/meta/callback
https://syzmeku-api.onrender.com/api/social-command/oauth/youtube/callback
https://syzmeku-api.onrender.com/api/social-command/oauth/tiktok/callback
```

## Provider Setup

### Meta: Facebook Pages and Instagram Professional

Official docs:

- Facebook Login manual flow: `https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/`
- Pages API publishing: `https://developers.facebook.com/docs/pages-api/posts/`
- Instagram Graph API content publishing: `https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/`

Configured scopes:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
instagram_basic
instagram_content_publish
instagram_manage_insights
```

Requirements:

- A Meta developer app with the production redirect URI added.
- Facebook Pages connected to the authenticating account.
- Instagram Professional accounts linked to a Facebook Page for Instagram publishing.
- Meta App Review and business verification as required by Meta for owner-operated production publishing to T.O.I. Souljah Academy business assets.

Implemented capabilities:

- Facebook Page text publishing through the Pages feed endpoint.
- Facebook Page image publishing through the Photos endpoint with a hosted HTTPS image URL.
- Instagram Professional image publishing through media container creation and publish.
- Insights refresh where the Graph API grants access to the requested metrics.
- Disconnect attempts provider-side permission revocation, then marks the local connection inactive.

### YouTube

Official docs:

- YouTube Data API `videos.insert`: `https://developers.google.com/youtube/v3/docs/videos/insert`
- Google OAuth 2.0 web server flow: `https://developers.google.com/identity/protocols/oauth2/web-server`

Configured scopes:

```text
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube.readonly
```

Requirements:

- A Google Cloud OAuth client with the YouTube Data API v3 enabled.
- The production redirect URI added to the OAuth client.
- OAuth consent screen configured for the requested scopes.
- YouTube API audit/verification for unrestricted public upload behavior. Unverified projects can be limited, including private-only uploads.

Implemented capabilities:

- OAuth with PKCE and offline access.
- Channel discovery.
- Refresh token support.
- Provider-side token revocation.
- Video upload is intentionally guarded until server-side media storage/streaming is configured. The adapter does not pretend to publish videos without the media pipeline.

### TikTok

Official docs:

- Content Posting API getting started: `https://developers.tiktok.com/doc/content-posting-api-get-started/`
- Login Kit scopes: `https://developers.tiktok.com/doc/tiktok-api-scopes/`

Configured scopes:

```text
user.info.basic
video.publish
video.upload
```

Requirements:

- A TikTok developer app with Login Kit and Content Posting API configured.
- Direct Post configuration and approval for `video.publish`.
- Verified media URL prefixes/domains for pull-from-URL publishing.
- App audit/approval for owner-operated production posting to the authenticated T.O.I. Souljah Academy TikTok account. This app is not offered as a public social media management service for outside users.

Implemented capabilities:

- OAuth with PKCE.
- User account discovery.
- Direct video post initialization from a hosted video URL.
- Photo post initialization from hosted image URLs.
- Post status lookup.
- Refresh token support.
- Provider-side token revocation.

## Campaign Flow

The server generates campaigns from `server/social/campaignGenerationService.js`. The built-in Freedom Audit launch template produces platform-specific drafts for:

- Facebook Page text post
- Instagram reel/caption draft
- YouTube Short metadata draft
- TikTok video draft

Each draft includes UTM-tagged links to `https://freedom.toisouljahacademy.com` with `utm_medium=social` and `utm_campaign=freedom_audit_launch`.

The founder/operator must approve a campaign before publishing. Publishing requires a connected account owned by that authenticated operator account. Publishing uses an idempotency key per campaign/post and skips posts already marked as published with a provider post ID.

## Scheduling

Schedules are stored in MongoDB on the campaign post records. Run due scheduled posts by calling:

```http
POST /api/social-command/scheduler/run-due
Authorization: Bearer <commander-token>
```

For production, call this endpoint from a trusted Render Cron job or an existing internal scheduler. The first implementation slice does not add an always-on worker process.

The scheduler endpoint is restricted to the authenticated `COMMANDER_IN_CHIEF` role because it can process due posts across stored campaigns.

## Security Model

- All Social Command routes require the `COMMANDER_IN_CHIEF` role except OAuth callbacks.
- OAuth callbacks validate the server-created state record and consume it once. Provider redirects cannot carry a bearer token, so callback authorization is state-based.
- OAuth callbacks redirect only to the server-configured Social Command URL. The callback handler does not accept arbitrary return URLs from provider query parameters.
- OAuth state is stored hashed and expires after 15 minutes.
- PKCE is used for YouTube and TikTok.
- Provider access and refresh tokens are encrypted with AES-256-GCM before database storage and never returned to the client.
- Media asset URLs are validated before storage. They must be public HTTPS URLs, cannot target localhost or private/reserved IP ranges, and can be constrained further with `SOCIAL_MEDIA_ALLOWED_ASSET_HOSTS`.
- Campaigns, connections, analytics snapshots, and publishing operations are scoped by `userId`.
- Audit log category `social-command` records account connection, disconnect, token refresh, campaign creation, approval, scheduling, publish success, and publish/schedule failure.

## Production Readiness Notes

- The public legal routes required for provider review are `/terms` and `/privacy`.
- The current TikTok app configuration should remain truthful during review: Social Command is a private, owner-operated publishing workflow for T.O.I. Souljah Academy accounts only. Login Kit and Content Posting API can be configured before approval, but production posting depends on TikTok approval and valid production credentials.
- Do not submit a TikTok demo that claims approved publishing behavior until the deployed Social Command flow can connect the real app, start OAuth, return to `/app/social-command`, and show the post approval workflow.
- TikTok, Meta, and YouTube client secrets must be configured only in the backend environment. They must not be committed, printed, or bundled into the frontend.

## Testing

Run the repository checks:

```bash
npm test
npm run social-command:test
npm run build --prefix freedom-audit
```

The Social Command harness validates encryption round-trip behavior, OAuth state hashing, provider capability declarations, campaign generation, UTM links, analytics normalization, idempotency keys, and Mongoose ownership validation without contacting external provider APIs.

Live provider testing requires sandbox/developer apps at Meta, Google, and TikTok with the redirect URIs and scopes above.
