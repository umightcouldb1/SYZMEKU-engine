import { useState } from 'react';

const platforms = [
  { id: 'facebook', label: 'Facebook', provider: 'meta', accountType: 'facebook_page' },
  { id: 'instagram', label: 'Instagram Reels', provider: 'meta', accountType: 'instagram_professional' },
  { id: 'youtube', label: 'YouTube Shorts', provider: 'youtube', accountType: 'youtube_channel' },
  { id: 'tiktok', label: 'TikTok', provider: 'tiktok', accountType: 'tiktok_user' },
];

export default function OrganicPlatformHandoff({ item, connections, onHandoff }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState(Object.fromEntries(platforms.map(p => [p.id, null])));
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const reviewed = item.package.production?.review?.method === 'FOUNDER_ATTESTATION';
  const ready = item.qa.canApprove && reviewed && ['DRAFT', 'HOLD', 'FOUNDER_REVIEW'].includes(item.status);
  const submit = async event => {
    event.preventDefault();
    if (pending || !ready || !confirmed) return;
    setPending(true);
    try { if (await onHandoff(targets)) setOpen(false); } finally { setPending(false); }
  };

  if (item.status === 'APPROVED') return <p>Four-platform approval recorded. Draft receipts appear below.</p>;
  return <section aria-label="Organic platform draft handoff">
    {!reviewed && <p>Record your finished-media review before approving this package for platform drafts.</p>}
    {!open ? <button disabled={!ready} onClick={() => setOpen(true)}>Review four-platform draft handoff</button> :
      <form className="content-editor" onSubmit={submit}>
        <p>Approve this exact version and its platform copy into four Social Command drafts. Nothing will be scheduled or published.</p>
        {platforms.map(platform => <label key={platform.id}>{platform.label} draft account
          <select value={targets[platform.id] || ''} disabled={pending} onChange={event => {
            setTargets({ ...targets, [platform.id]: event.target.value || null });
            setConfirmed(false);
          }}>
            <option value="">Unassigned, draft only</option>
            {connections.filter(c => c.provider === platform.provider && c.accountType === platform.accountType)
              .map(c => <option key={c._id} value={c._id}>{c.accountName} · {c.accountType}</option>)}
          </select>
        </label>)}
        <p>TikTok stays draft-only. Unassigned drafts cannot publish. Connecting or changing a target requires another Content Factory review. Connected Facebook, Instagram and YouTube drafts need separate approval for immediate publication in Social Command. Scheduling changes invalidate this handoff and are not supported by this workflow.</p>
        <label className="content-check"><input type="checkbox" checked={confirmed} disabled={pending}
          onChange={event => setConfirmed(event.target.checked)} />I reviewed this exact media, platform titles, captions, descriptions, destinations and selected accounts. Approve drafts only.</label>
        <div className="content-controls">
          <button type="submit" disabled={!ready || !confirmed || pending}>{pending ? 'Creating drafts…' : 'Approve four platform drafts'}</button>
          <button type="button" disabled={pending} onClick={() => { setOpen(false); setConfirmed(false); }}>Cancel handoff</button>
        </div>
      </form>}
  </section>;
}
