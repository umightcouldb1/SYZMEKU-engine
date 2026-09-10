const ROLES = Object.freeze([
  'Chief of Staff', 'Growth + Conversion', 'Marketing Strategy', 'Content Intelligence',
  'Social Command Analyst', 'Funnel / Sales', 'Commerce / Revenue', 'Product Intelligence',
  'Technology / SRE', 'Customer Journey',
]);
function ownerId(env = process.env) {
  const id = env.ENTERPRISE_OWNER_USER_ID || '';
  return /^[a-f0-9]{24}$/.test(id) ? id : null;
}
function enabled(env = process.env) { return env.ENTERPRISE_INTELLIGENCE_ENABLED === 'true' && !!ownerId(env); }
function canRead(user, env = process.env) {
  return enabled(env) && user?.role === 'COMMANDER_IN_CHIEF' && String(user?._id || '') === ownerId(env);
}
const EVENTS = Object.freeze(['landing_view', 'cta_click', 'sign_in_start', 'sign_in_success', 'checkout_start', 'checkout_return', 'product_start', 'product_complete', 'client_error']);
const SOURCES = ['facebook', 'instagram', 'youtube', 'tiktok'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function parseEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['id', 'visitId', 'event', 'source', 'campaign', 'returnState'].includes(k)) || !uuid(body.id) || !uuid(body.visitId) || !EVENTS.includes(body.event)) return null;
  return { _id: body.id, visitId: body.visitId, event: body.event, product: 'freedom-audit',
    source: SOURCES.includes(body.source) ? body.source : 'unattributed',
    campaign: body.campaign === 'freedom_audit_launch' ? body.campaign : 'unattributed',
    returnState: ['success', 'canceled'].includes(body.returnState) ? body.returnState : null,
    authority: 'unverified_browser_event' };
}
module.exports = { ROLES, ownerId, enabled, canRead, EVENTS, parseEvent };
