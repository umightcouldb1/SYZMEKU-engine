# Organic Content Factory draft handoff

An organic package is a parent asset, not a social provider. Its exact reviewed version can now produce four separate Social Command drafts for Facebook, Instagram Reels, YouTube Shorts and TikTok.

## Founder workflow

1. Review the rendered media and record the existing finished-media attestation. Automated technical checks are insufficient.
2. Review all platform-native titles, captions, descriptions, CTAs and destinations shown on the parent.
3. Choose **Review four-platform draft handoff**. Select the exact owned account for each platform or explicitly leave it unassigned.
4. Confirm **Approve four platform drafts**. This creates draft campaigns only. No provider API is called, no date is scheduled, and no money is spent.
5. Account-bound Facebook/Instagram/YouTube drafts still require the existing separate Social Command approval before immediate publication. Scheduling changes invalidate the exact receipt and are not supported by this handoff. TikTok and unassigned drafts remain blocked from publication. Content Factory TikTok drafts also cannot use the separate upload-to-TikTok endpoint. To change a target, HOLD the parent and review a fresh handoff. Older receipts remain invalid.

For a platform-specific offer URL, the parent destination must explicitly contain the same verified URL before handoff. The server does not infer verification from a parent with no destination.

## Exactness and safety

- The founder-only endpoint is `POST /api/content-factory/:id/platform-drafts` with `expectedHash`, `version`, and all four `targets` keys (`facebook`, `instagram`, `youtube`, `tiktok`). Each target is an owned active matching account ID or `null`.
- All four creations and the parent approval are transactional. A failed account check leaves no partial drafts.
- Same-version, same-target retries are idempotent, including concurrent requests. Different targets require a fresh explicit review.
- Copy, hashtags, media URL, media checksum, CTA, cover text, destination, and parent provenance are retained. Each platform gets a unique attribution ID and, when applicable, a tracked URL in metadata. Caption/description text is not silently rewritten. Shared profile links still do not prove originating-post attribution.
- Each receipt binds its campaign ID, post ID, exact publishing payload, parent version, and handoff ID. Parent edits, rejection, HOLD, later relevant voice feedback, account changes and payload changes block dispatch. Existing ordinary campaigns retain their existing path.
- Handoff does not claim that a media URL is immutable. Existing dispatch-time byte/checksum verification is retained.
- The founder-state preservation fix in PR #116 is a required companion before deployment, so the recurring materializer cannot reset these approvals.

## Verification

`npm run c0:test` includes `contentPlatformHandoff.test.cjs`: four-platform exactness, transaction rollback, concurrent retries, founder/owner gates, invalidated receipts, unassigned/TikTok dispatch blocking, target verification and tracking provenance. `npm run c0:browser` exercises the real UI's account filtering, confirmation, cancellation, draft creation and reload persistence.
