import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl } from './utils/api.js';
import { saveGuestConversation } from './utils/guestConversation.js';
import './interactionEnhancements.css';

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  async function send(event) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(buildApiUrl('/api/ai/public/intelligence'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestMentor: true, prompt: message.trim(), guestTurns: turns.map(turn => turn.token) }),
      });
      const data = await response.json();
      if (!response.ok || !data.guestTurn || !data.response) throw new Error(data.message || 'BIG SYZ is unavailable right now. Please try again.');
      setTurns(current => [...current, { question: message.trim(), answer: data.response, token: data.guestTurn }].slice(-6));
      setMessage('');
    } catch (failure) { setError(failure.message || 'Could not connect. Your message is still here to retry.'); }
    finally { setBusy(false); }
  }
  function enter(path) {
    try { saveGuestConversation(consent ? turns : []); navigate(path); }
    catch (_) { setError('Your browser could not keep this conversation. Uncheck the save option to continue without it.'); }
  }
  return <main className="entry-shell"><section className="welcome-panel">
    <p className="auth-eyebrow">T.O.I. Souljah Academy</p>
    <h1>Meet BIG SYZ</h1>
    <p>A personal mentor for what matters to you. Bring a question, a feeling, an idea—or simply tell me how today is going.</p>
    <div aria-live="polite" aria-label="Guest conversation">
      {turns.map((turn, index) => <article key={index}>
        <p><strong>You</strong></p><p style={{ whiteSpace: 'pre-wrap' }}>{turn.question}</p>
        <p><strong>BIG SYZ</strong></p><p style={{ whiteSpace: 'pre-wrap' }}>{turn.answer}</p>
      </article>)}
    </div>
    <form onSubmit={send}>
      <label htmlFor="guest-message">What’s on your mind?</label>
      <textarea id="guest-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={3000} disabled={busy} />
      <button className="entry-primary-button" disabled={busy || !message.trim()}>{busy ? 'BIG SYZ is responding…' : 'Send message'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {turns.length > 0 && <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Keep my last six exchanges in this tab for up to 24 hours so I can choose to save them to my account after signing in.</label>}
    <p>Your conversation is sent to our AI provider to generate replies. Saving it to an account is optional.</p>
    <div className="welcome-actions">
      <button type="button" className="entry-primary-button" disabled={busy} onClick={() => enter('/signup')}>Create an account</button>
      <button type="button" className="entry-secondary-button" disabled={busy} onClick={() => enter('/login')}>Sign in</button>
    </div>
  </section></main>;
}
