import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './socialCommand.css';

const providerLabels = {
  meta: 'Meta',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

const getToken = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.token || localStorage.getItem('token') || '';
  } catch (_error) {
    return localStorage.getItem('token') || '';
  }
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const clearStoredAuth = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('syz_onboarding_complete');
};

const postStatusLabel = (post) => {
  if (post.publishStatus === 'published') return 'Published';
  if (post.publishStatus === 'scheduled') return 'Scheduled';
  if (post.scheduledTime) return 'Planned';
  if (post.connectedAccountId) return 'Ready';
  return 'Needs account';
};

const toDatetimeLocalValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fromDatetimeLocalValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const hasPlannedSchedule = (campaign) => (campaign?.posts || []).some((post) => post.scheduledTime && post.connectedAccountId);

const firstMediaUrl = (post) => (post.mediaAssets || []).find((asset) => asset.url)?.url || '';

const mediaTypeForPost = (post) => (
  ['video', 'short', 'reel'].includes(post.format) ? 'video'
    : post.format === 'image' ? 'image'
      : 'link'
);

export default function SocialCommandDashboard() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const activeConnections = useMemo(() => connections.filter((connection) => connection.active), [connections]);
  const campaignSummary = activeCampaign?.summary || {};

  const api = async (method, url, data) => {
    try {
      const response = await axios.request({
        method,
        url,
        data,
        headers: authHeaders(),
      });
      return response.data;
    } catch (apiError) {
      if (apiError?.response?.status === 401) {
        clearStoredAuth();
        navigate('/login', {
          replace: true,
          state: { from: { pathname: '/app/social-command', search: '' } },
        });
      }
      throw apiError;
    }
  };

  const loadAll = async ({ preserveError = false, refreshCampaignId = null } = {}) => {
    if (!preserveError) setError('');
    const [providerData, connectionData, campaignData, refreshedCampaign] = await Promise.all([
      api('get', '/api/social-command/providers'),
      api('get', '/api/social-command/connections'),
      api('get', '/api/social-command/campaigns'),
      refreshCampaignId ? api('get', `/api/social-command/campaigns/${refreshCampaignId}`) : null,
    ]);
    if (refreshCampaignId && String(refreshedCampaign?.campaign?._id) !== String(refreshCampaignId)) {
      throw new Error('The latest campaign response could not be verified.');
    }
    setProviders(providerData.providers || []);
    setConnections(connectionData.connections || []);
    setCampaigns(campaignData.campaigns || []);
    if (campaignData.storageError && !preserveError) setError(campaignData.storageError);
    setActiveCampaign((current) => {
      // A late publication refresh must not steal a newer selection or overwrite
      // edits in another campaign. Fetch the exact ID even outside the list page.
      if (refreshCampaignId && String(current?.campaign?._id) === String(refreshCampaignId)) {
        return { ...refreshedCampaign, publicationRefreshPending: false };
      }
      if (!current && campaignData.campaigns?.[0]) {
        const latestCampaign = campaignData.campaigns[0];
        return { campaign: latestCampaign, summary: latestCampaign.summary };
      }
      return current;
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const socialStatus = params.get('social_status');
    const socialProvider = params.get('social_provider');
    const socialError = params.get('social_error');
    if (socialStatus === 'connected') {
      setMessage(`${providerLabels[socialProvider] || socialProvider || 'Provider'} account connected.`);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (socialStatus === 'no_accounts') {
      setError(`${providerLabels[socialProvider] || socialProvider || 'Provider'} authorization completed, but no eligible account was returned.`);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (socialStatus === 'error') {
      setError(socialError ? `Social connection failed: ${socialError}` : 'Social connection failed.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    loadAll().catch((loadError) => {
      if (loadError?.response?.status === 401) {
        setError('Your session expired. Sign in again to reconnect Social Command.');
        return;
      }
      setError(loadError?.response?.data?.error || 'Social Command failed to load.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectProvider = async (provider) => {
    setError('');
    setMessage('');
    try {
      const data = await api('post', `/api/social-command/connections/${provider}/authorize`, {});
      window.location.assign(data.authorizationUrl);
    } catch (connectError) {
      setError(connectError?.response?.data?.error || `${providerLabels[provider] || provider} credentials are not configured yet.`);
    }
  };

  const seedFreedomAudit = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await api('post', '/api/social-command/campaigns/freedom-audit-launch', {});
      await loadAll();
      setActiveCampaign(data);
      setMessage('Freedom Audit Launch drafts are ready for review.');
    } catch (seedError) {
      setError(seedError?.response?.data?.error || 'Could not create the Freedom Audit launch campaign.');
    } finally {
      setLoading(false);
    }
  };

  const saveCampaign = async () => {
    if (!activeCampaign?.campaign?._id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api('put', `/api/social-command/campaigns/${activeCampaign.campaign._id}`, activeCampaign.campaign);
      setActiveCampaign(data);
      await loadAll();
      setMessage('Review version saved only in Google Drive. Approve this version before publishing.');
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'Could not save campaign edits.');
    } finally {
      setLoading(false);
    }
  };

  const activateSchedule = async () => {
    const release = activeCampaign?.campaign?.metadata?.c0;
    if (release?.storage === 'GOOGLE_DRIVE' && !window.confirm(`Activate this exact YouTube upload for ${release.scheduledTime}, channel ${release.providerAccountId}, ${release.privacyStatus} visibility? Due posts can upload automatically after activation.`)) return;
    if (activeCampaign?.dirty) { setError('Save and approve your edited version before scheduling.'); return; }
    if (!activeCampaign?.campaign?._id) return;
    setLoading(true);
    setError('');
    try {
      const postSchedules = (activeCampaign.campaign.posts || [])
        .filter((post) => post._id && post.scheduledTime && post.connectedAccountId)
        .map((post) => ({ postId: post._id, scheduledTime: post.scheduledTime }));
      const data = await api('post', `/api/social-command/campaigns/${activeCampaign.campaign._id}/schedule`, { postSchedules });
      setActiveCampaign(data);
      await loadAll();
      setMessage('Campaign schedule activated. Due posts will publish through connected official APIs.');
    } catch (scheduleError) {
      setError(scheduleError?.response?.data?.error || 'Could not activate campaign schedule.');
    } finally {
      setLoading(false);
    }
  };

  const approveCampaign = async () => {
    if (activeCampaign?.dirty) { setError('Save your edits to Drive, then review and approve that version.'); return; }
    if (!activeCampaign?.campaign?._id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api('post', `/api/social-command/campaigns/${activeCampaign.campaign._id}/approve`, { expectedHash: activeCampaign.campaign.receiptSync?.status === 'pending' ? activeCampaign.campaign.receiptSync.hash : activeCampaign.campaign.metadata?.driveApproval?.hash || activeCampaign.campaign.expectedHash, expectedRevision: activeCampaign.campaign.expectedRevision });
      setActiveCampaign(data);
      await loadAll();
      setMessage(data.campaign?.receiptSync?.status === 'pending'
        ? 'Campaign approved. Its Drive receipt is still syncing. Retry receipt sync without approving or publishing again.'
        : 'Campaign approved and Drive receipt confirmed. Scheduling and publishing remain separate actions.');
    } catch (approveError) {
      setError(approveError?.response?.data?.error || 'Could not approve campaign.');
    } finally {
      setLoading(false);
    }
  };

  const publishReleased = async () => {
    const selected = activeCampaign?.campaign, receipt = selected?.metadata?.c0;
    if (!receipt || receipt.storage !== 'GOOGLE_DRIVE' || activeCampaign?.dirty || activeCampaign?.publicationRefreshPending || receipt.scheduledTime || selected.posts?.some(post => post.publishAttempts > 0 || post.publishStatus === 'published')) return;
    if (!window.confirm(`Upload this exact approved video now to YouTube channel ${receipt.providerAccountId} with ${receipt.privacyStatus} visibility?`)) return;
    setLoading(true); setError(''); setMessage('');
    setActiveCampaign((current) => String(current?.campaign?._id) === String(selected._id)
      ? { ...current, publicationRefreshPending: true } : current);
    let uploadError = '';
    try {
      try {
        await api('post', `/api/social-command/campaigns/${selected._id}/publish`, {});
        setMessage('YouTube confirmed the upload.');
      } catch (publishError) {
        uploadError = publishError?.response?.data?.code || publishError?.response?.data?.error || 'Upload outcome is unconfirmed. Inspect the channel before retrying.';
        setError(uploadError);
      }
      try {
        await loadAll({ preserveError: true, refreshCampaignId: selected._id });
      } catch {
        // Keep the local pending flag and original upload error when the read
        // fails. An old publishAttempts=0 must not re-enable the Publish button.
        setError(uploadError
          ? `${uploadError} Latest campaign status could not be loaded. Publishing remains blocked here; inspect the channel.`
          : 'YouTube confirmed the upload, but its latest campaign status could not be loaded. Publishing remains blocked here.');
      }
    } finally { setLoading(false); }
  };

  const refreshAnalytics = async () => {
    if (!activeCampaign?.campaign?._id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api('post', `/api/social-command/campaigns/${activeCampaign.campaign._id}/analytics/refresh`, {});
      setActiveCampaign(data);
      setMessage('Analytics refreshed where provider APIs allow access.');
    } catch (analyticsError) {
      setError(analyticsError?.response?.data?.error || 'Analytics refresh is not available for these posts yet.');
    } finally {
      setLoading(false);
    }
  };

  const updatePost = (postIndex, patch) => {
    setActiveCampaign((current) => {
      const campaign = { ...(current?.campaign || {}) };
      campaign.posts = [...(campaign.posts || [])];
      campaign.posts[postIndex] = { ...campaign.posts[postIndex], ...patch };
      return { ...(current || {}), campaign, dirty: true };
    });
  };

  const updatePostMediaUrl = (postIndex, url) => {
    setActiveCampaign((current) => {
      const campaign = { ...(current?.campaign || {}) };
      campaign.posts = [...(campaign.posts || [])];
      const post = { ...campaign.posts[postIndex] };
      const trimmedUrl = url.trim();
      post.mediaAssets = trimmedUrl
        ? [{
          ...(post.mediaAssets?.[0] || {}),
          url: trimmedUrl,
          type: mediaTypeForPost(post),
          mimeType: mediaTypeForPost(post) === 'video' ? 'video/mp4' : '',
        }]
        : [];
      campaign.posts[postIndex] = post;
      return { ...(current || {}), campaign, dirty: true };
    });
  };

  const campaign = activeCampaign?.campaign || null;
  const c0Release = campaign?.metadata?.c0?.storage === 'GOOGLE_DRIVE' ? campaign.metadata.c0 : null;
  const plannedScheduleAvailable = hasPlannedSchedule(campaign);
  const approvalActionLabel = campaign?.receiptSync?.status === 'pending' ? 'Retry Drive Receipt Sync' : campaign?.status === 'approved' && plannedScheduleAvailable ? 'Activate Schedule' : 'Approve Campaign';
  const approvalAction = campaign?.receiptSync?.status !== 'pending' && campaign?.status === 'approved' && plannedScheduleAvailable ? activateSchedule : approveCampaign;
  const approvalActionDisabled = loading || activeCampaign?.dirty || (campaign?.receiptSync?.status !== 'pending' && ['scheduled','published'].includes(campaign?.status));

  return (
    <main className="social-command" aria-label="SYZMEKU Social Command">
      <header className="social-command__header">
        <div>
          <p className="social-command__eyebrow">SYZMEKU Social Command</p>
          <h1>Campaign control without platform chaos.</h1>
          <p>Connect official accounts once, generate platform-native drafts, approve the sequence, and publish only when the owner says launch.</p>
        </div>
        <button type="button" onClick={seedFreedomAudit} disabled={loading}>
          Launch Freedom Audit Campaign
        </button>
      </header>

      {(message || error) && (
        <div className={`social-command__notice ${error ? 'is-error' : ''}`} role="status">
          {error || message}
        </div>
      )}

      <section className="social-command__grid">
        <aside className="social-command__panel">
          <div className="social-command__panel-heading">
            <h2>Connections</h2>
            <span>{activeConnections.length} active</span>
          </div>
          <div className="social-command__provider-list">
            {providers.map((provider) => (
              <article key={provider.id} className="social-command__provider">
                <div>
                  <strong>{provider.displayName}</strong>
                  <p>{Object.values(provider.capabilities || {}).map((capability) => capability.note).filter(Boolean)[0] || 'Official API connection.'}</p>
                </div>
                <button type="button" onClick={() => connectProvider(provider.id)}>Connect</button>
              </article>
            ))}
          </div>
          <div className="social-command__connections">
            {activeConnections.map((connection) => (
              <div key={connection.id} className="social-command__connection">
                <span>{providerLabels[connection.provider] || connection.provider}</span>
                <strong>{connection.accountName}</strong>
                <small>{connection.accountType}</small>
              </div>
            ))}
            {!activeConnections.length && <p className="social-command__muted">No accounts connected yet. Drafts can be prepared now and published later.</p>}
          </div>
        </aside>

        <section className="social-command__panel social-command__workspace">
          <div className="social-command__panel-heading">
            <h2>{campaign?.name || 'Campaign Drafts'}</h2>
            <span>{campaign?.status || 'empty'}</span>
          </div>

          {!campaign ? (
            <div className="social-command__empty">
              <h3>Freedom Audit Launch is one click away.</h3>
              <p>Generate Facebook, Instagram, YouTube, and TikTok-ready drafts with UTM links and a human approval gate.</p>
            </div>
          ) : (
            <>
              <div className="social-command__summary">
                <div><strong>{campaign.posts?.length || 0}</strong><span>drafts</span></div>
                <div><strong>{campaignSummary.publishedPosts || 0}</strong><span>published</span></div>
                <div><strong>{campaignSummary.views || campaignSummary.impressions || 0}</strong><span>views/impressions</span></div>
                <div><strong>{campaignSummary.clicks || 0}</strong><span>clicks</span></div>
              </div>

              <label className="social-command__field">
                Campaign objective
                <textarea
                  readOnly={!!c0Release}
                  value={campaign.objective || ''}
                  onChange={(event) => setActiveCampaign((current) => ({ ...current, dirty: true, campaign: { ...current.campaign, objective: event.target.value } }))}
                />
              </label>

              <div className="social-command__posts">
                {(campaign.posts || []).map((post, index) => (
                  <article className="social-command__post" key={post._id || `${post.provider}-${index}`}>
                    <div className="social-command__post-head">
                      <span>{providerLabels[post.provider] || post.provider}</span>
                      <strong>{post.format}</strong>
                      <em>{postStatusLabel(post)}</em>
                    </div>
                    <label>
                      Title
                      <input readOnly={!!c0Release} value={post.title || ''} onChange={(event) => updatePost(index, { title: event.target.value })} />
                    </label>
                    <label>
                      Caption / copy
                      <textarea readOnly={!!c0Release} value={post.caption || post.description || ''} onChange={(event) => updatePost(index, { caption: event.target.value, description: event.target.value })} />
                    </label>
                    <label>
                      Link
                      <input readOnly={!!c0Release} value={post.link || ''} onChange={(event) => updatePost(index, { link: event.target.value })} />
                    </label>
                    {post.format !== 'text' && (
                      <label>
                        {c0Release?'Private Drive source (no public URL)':'Hosted media URL'}
                        <input
                          readOnly={!!c0Release}
                          value={firstMediaUrl(post)}
                          placeholder="https://..."
                          onChange={(event) => updatePostMediaUrl(index, event.target.value)}
                        />
                      </label>
                    )}
                    <label>
                      Planned launch time
                      <input
                        readOnly={!!c0Release}
                        type="datetime-local"
                        value={toDatetimeLocalValue(post.scheduledTime)}
                        onChange={(event) => updatePost(index, { scheduledTime: fromDatetimeLocalValue(event.target.value) })}
                      />
                    </label>
                    <label>
                      Account
                      <select disabled={!!c0Release} value={post.connectedAccountId || ''} onChange={(event) => updatePost(index, { connectedAccountId: event.target.value })}>
                        <option value="">Choose connected account later</option>
                        {activeConnections.filter((connection) => connection.provider === post.provider).map((connection) => (
                          <option key={connection.id} value={connection.id}>{connection.accountName} ({connection.accountType})</option>
                        ))}
                      </select>
                    </label>
                    {post.providerUrl && (
                      <a className="social-command__published-link" href={post.providerUrl} target="_blank" rel="noreferrer">Open published post</a>
                    )}
                    {post.error?.message && (
                      <p className="social-command__post-error">{post.error.message}</p>
                    )}
                  </article>
                ))}
              </div>

              <div className="social-command__actions">
                <button type="button" onClick={saveCampaign} disabled={loading||!!c0Release}>Save Drafts</button>
                <button type="button" onClick={approvalAction} disabled={approvalActionDisabled||!!c0Release&&!plannedScheduleAvailable}>{approvalActionLabel}</button>
                {c0Release&&!c0Release.scheduledTime&&<button type="button" onClick={publishReleased} disabled={loading||activeCampaign?.dirty||activeCampaign?.publicationRefreshPending||campaign.posts.some(p=>p.publishAttempts>0||p.publishStatus==='published')}>Publish approved video now ({c0Release.privacyStatus})</button>}
                <button type="button" onClick={refreshAnalytics} disabled={loading}>Refresh Analytics</button>
                <p>Approval, release, schedule activation and publishing are separate actions. A C0 release is read-only here. To change its copy, channel, visibility or time, edit and review a new version in Content Factory.</p>
              </div>
            </>
          )}
        </section>

        <aside className="social-command__panel">
          <div className="social-command__panel-heading">
            <h2>Campaigns</h2>
            <span>{campaigns.length}</span>
          </div>
          <div className="social-command__campaign-list">
            {campaigns.map((item) => (
              <button key={item._id} type="button" onClick={() => setActiveCampaign({ campaign: item, summary: item.summary })}>
                <strong>{item.name}</strong>
                <span>{item.status}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
