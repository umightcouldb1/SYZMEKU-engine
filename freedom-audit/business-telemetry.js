// E0 business-only telemetry. No credentials, answers, URLs, referrers or user content.
// Non-blocking and failure-isolated; never decides auth, entitlement or checkout behavior.
window.freedomBusinessEvent = (() => {
  if (location.hostname !== 'freedom.toisouljahacademy.com' || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return () => {};
  let visitId, source = '', medium = '', campaign = '', content = '';
  try {
    const key = 'freedomBusinessVisit';
    visitId = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, visitId);
    const params = new URLSearchParams(location.search);
    const nextSource = params.get('utm_source');
    if (['facebook', 'instagram', 'youtube', 'tiktok'].includes(nextSource)) sessionStorage.setItem('freedomBusinessSource', nextSource);
    const nextMedium = params.get('utm_medium');
    if (/^[a-z0-9_-]{1,40}$/i.test(nextMedium || '')) sessionStorage.setItem('freedomBusinessMedium', nextMedium);
    const nextCampaign = params.get('utm_campaign');
    if (/^(freedom_audit_launch|fa_launch_[a-z0-9_]{1,90})$/i.test(nextCampaign || '')) sessionStorage.setItem('freedomBusinessCampaign', nextCampaign);
    const nextContent = params.get('utm_content');
    if (/^fa_launch_[a-z0-9_]{1,90}$/i.test(nextContent || '')) sessionStorage.setItem('freedomBusinessContent', nextContent);
    source = sessionStorage.getItem('freedomBusinessSource') || '';
    medium = sessionStorage.getItem('freedomBusinessMedium') || '';
    campaign = sessionStorage.getItem('freedomBusinessCampaign') || '';
    content = sessionStorage.getItem('freedomBusinessContent') || '';
  } catch { return () => {}; }
  return (event, returnState) => {
    try {
      const body = JSON.stringify({ id: crypto.randomUUID(), visitId, event, source, medium, campaign, content, ...(returnState ? { returnState } : {}) });
      void fetch('https://syzmeku-api.onrender.com/api/enterprise/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch { /* Analytics must never interrupt the buyer journey. */ }
  };
})();
window.freedomBusinessEvent('landing_view');
try {
  const state = new URLSearchParams(location.search).get('checkout');
  if (['success', 'canceled'].includes(state)) window.freedomBusinessEvent('checkout_return', state);
} catch { /* Optional analytics only. */ }
