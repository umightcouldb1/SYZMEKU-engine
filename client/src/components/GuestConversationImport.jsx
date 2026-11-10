import React, { useState } from 'react';
import axios from 'axios';
import { readGuestConversation, saveGuestConversation } from '../utils/guestConversation';

export default function GuestConversationImport({ user, onSaved }) {
  const [turns, setTurns] = useState(readGuestConversation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!turns.length) return null;
  function discard() { saveGuestConversation([]); setTurns([]); }
  async function save() {
    setBusy(true); setError('');
    try {
      await axios.post('/api/memory/guest-conversation', { consent: true, tokens: turns.map(turn => turn.token) });
      discard(); await onSaved();
    } catch (failure) { setError(failure.response?.data?.message || 'Could not save yet. Your guest conversation is still available to retry.'); }
    finally { setBusy(false); }
  }
  return <section className="mentor-card" aria-label="Save guest conversation">
    <h2>Continue where we started?</h2>
    <p>Save these exchanges to {user?.email || user?.name || 'your signed-in account'} so BIG SYZ can use them in future conversations.</p>
    <details><summary>Review conversation before saving</summary>{turns.map((turn, index) => <div key={index}><p>You: {turn.question}</p><p>BIG SYZ: {turn.answer}</p></div>)}</details>
    <button type="button" className="mentor-button" disabled={busy} onClick={save}>Save to this account</button>
    <button type="button" className="mentor-button secondary" disabled={busy} onClick={discard}>Discard guest conversation</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
