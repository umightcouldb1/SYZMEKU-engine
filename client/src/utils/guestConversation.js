const key = 'big-syz-guest-conversation';
export function saveGuestConversation(turns) {
  if (!turns.length) { sessionStorage.removeItem(key); return; }
  sessionStorage.setItem(key, JSON.stringify({ expires: Date.now() + 86400000, turns }));
}
export function readGuestConversation() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (saved?.expires > Date.now() && Array.isArray(saved.turns) && saved.turns.length <= 6) return saved.turns;
    sessionStorage.removeItem(key);
  } catch (_) { /* Storage unavailable or invalid: never import silently. */ }
  return [];
}
