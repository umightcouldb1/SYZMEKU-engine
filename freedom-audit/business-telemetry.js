// E0 business-only telemetry. No credentials, answers, URLs, referrers or user content.
// Non-blocking and failure-isolated; never decides auth, entitlement or checkout behavior.
window.freedomBusinessEvent = (() => {
  if (location.hostname !== 'freedom.toisouljahacademy.com' || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return () => {};
  let visitId, source = '', campaign = '';
  try {
    const key = 'freedomBusinessVisit';
    visitId = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, visitId);
    const params = new URLSearchParams(location.search);
    const nextSource = params.get('utm_source');
    if (['facebook', 'instagram', 'youtube', 'tiktok'].includes(nextSource)) sessionStorage.setItem('freedomBusinessSource', nextSource);
    if (params.get('utm_campaign') === 'freedom_audit_launch') sessionStorage.setItem('freedomBusinessCampaign', 'freedom_audit_launch');
    source = sessionStorage.getItem('freedomBusinessSource') || '';
    campaign = sessionStorage.getItem('freedomBusinessCampaign') || '';
  } catch { return () => {}; }
  return (event, returnState) => {
    try {
      const body = JSON.stringify({ id: crypto.randomUUID(), visitId, event, source, campaign, ...(returnState ? { returnState } : {}) });
      void fetch('https://syzmeku-api.onrender.com/api/enterprise/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch { /* Analytics must never interrupt the buyer journey. */ }
  };
})();
window.freedomBusinessEvent('landing_view');
try {
  const state = new URLSearchParams(location.search).get('checkout');
  if (['success', 'canceled'].includes(state)) window.freedomBusinessEvent('checkout_return', state);
} catch { /* Optional analytics only. */ }
