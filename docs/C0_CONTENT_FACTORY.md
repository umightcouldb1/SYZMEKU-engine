# Content Factory C0

C0 extends private Commander/E0. It prepares business content, never reads personal Core context, and never pays for generation. The existing Academy Google login and server-authoritative founder access are reused.

## Live boundary

Enable with `CONTENT_FACTORY_ENABLED=true`, E0 enabled and the existing exact `ENTERPRISE_OWNER_USER_ID`. Set `CONTENT_FACTORY_START_DATE=YYYY-MM-DD` for a fixed 30-day calendar in America/Chicago. Core M3 and personal execution flags remain false. Neither C0 preparation nor a queue approval publishes or schedules public content.

The queue lives inside `/app/commander`. All `/api/content-factory` routes require authenticated exact owner plus current COMMANDER_IN_CHIEF. A caller cannot supply an owner. GETs never initialize state. Prepared items, immutable versions, voice feedback, Google draft receipts and daily preparation state reuse `enterprisestates`; no duplicate personal/business authority collections or explicit indexes are added.

## Voice and production packages

The revised founder seed adds three explicit asset voices: `TOI_FOUNDER`, `BIG_SYZ`, and `TOI_BRAND`, with intensity 0 CLEAN / 1 NATURAL / 2 RAW T.O.I. Big SYZ is modeled as a distinct founder-derived lineage voice, never founder impersonation or a claim of literal sentience. The existing personal Core personality/model paths are not changed by C0. `FOUNDER_LEXICON_V1` recognizes the five supplied spellings without automatically rewriting all prose. Plain-language discovery keywords remain separate. Founder feedback records a category, optional phrase/replacement, note, selected voice, source item/version and timestamp. Positive preservation feedback never becomes a rejection. Exact phrase corrections influence subsequent content in that voice; broader category preferences are carried forward for review, not falsely claimed as an autonomous learned model.

`TOI_VISUAL_DNA_V1` defines dark/charcoal, gold/amber, white, selective warning, teal and iridescent roles; lighting, typography, camera, motion, human-representation and symbolism rules. Reusable SVG scene artwork implements ring systems, constrained signals, node paths, score and CTA layouts. Commander previews and downloads the actual vector scene drafts. Unknown sacred/cultural symbols and invented human portraits are not used. Color/geometry drift and draft text bounds are checked automatically; premium cinematic realism, actual readability and semantic visual integrity remain pending until explicitly reviewed against finished media. A vector storyboard is not a generated cinematic video.

`server/enterprise/content/voice.js` is TOI_VOICE_V1. Its first authority is the founder's September 10 C0 instruction and explicit examples/rejections. Existing first-party product/campaign material supports names, offer and themes, but is not misrepresented as a corpus of founder-authored speech. New rejection overrides previously published copy. No customer conversation, LifeContext, private notes, audio biometric model or false autobiography is used.

Voice QA checks known phrases and learned corrections. Its PASS means rule checks passed, not that an algorithm certified the founder's personality. Exceptions are explicit per-content-version entries. Founder edits/holds/rejections can supply phrase/replacement feedback; those rules persist, affect regenerated/future items and are checked again before publishing. Feedback history is bounded. Draft regeneration uses prepared alternatives and explicit replacements, not paid LLM calls.

Four platform Variant B packages preserve the 24-second conversion sequence with rewritten narration, scenes, illustrative outputs, proposed cover, metadata, subtitle timings and audio direction. Demo numbers are illustrative, not customer outcomes or validated clinical scores. Control A is never overwritten. The first long-form package contains about 1,580 words, an estimated 12-minute runtime, five titles, thumbnail concepts, a standalone exercise, chapters, an optional late offer, pinned comment and six extraction markers. The 30-day plan prepares teaching excerpts; three later long-form slots are labeled outlines requiring full scripts, not falsely labeled finished videos.

## Daily preparation and limits

The bounded in-process job checks every 15 minutes and shortly after boot. Stable per-item IDs make retries/restarts idempotent. It prepares due material from the authorized 30-day calendar, applies current phrase corrections and records the last run. It stops at the calendar boundary. There are no continuous model calls or new paid services. Render free-instance sleep can delay preparation; this is not an always-on scheduler or a guarantee of 10–15-minute end-to-end founder involvement.

Preparation, editing, regeneration, hold and reject cannot create Social campaigns or perform public actions. The queue shows actual failed/pending checks. Media approval is disabled while render/audio/destination review is incomplete. Current storyboard previews are not rendered videos.

## Approval and existing publishing integration

Approval requires exact item ID, version number and SHA-256 package hash, with current QA passing. Approve All submits the displayed immutable versions; one failing item aborts the database transaction. An approval creates a new **draft** in existing Social Command and an owner approval receipt. It never calls publish/schedule. Public scheduling/publishing still requires the founder's existing explicit Social action. Editing after approval invalidates it; reapproval creates a new draft rather than replacing earlier campaign history.

A C0-specific guard before provider/token operations checks the current item approval, package hash, exact publishing fields, and current voice rules. It also verifies the reviewed media checksum before dispatch. Ordinary existing campaigns retain their original authorization path. Already-published posts keep the existing idempotent skip. The approved asset must be served at the prepared content-factory asset path; C0 does not upload new public media. A future production/storage handoff must supply that asset without mutating an existing published file.

Finished-media review currently accepts **explicit founder attestations** of exact URL/hash/duration and the listed media checks. It labels them MANUAL_PASS, never automated QA. New media or edited copy invalidates that review. No blanket internal agent approval is possible. The queued approval UI is therefore not a claim that automated audio/blank-frame/semantic QA has been completed.

## Small future publishing fixes

Facebook video requests now include the stored title and normalized caption hashtags. Instagram image/Reel captions receive literal, deduplicated hashtag prefixes. Existing published posts are untouched. YouTube Shorts packages use a profile CTA, not a claim that description/comment URLs are clickable. Actual public profile links still need verification or separately approved changes. TikTok remains production review/OAuth pending and is not classified as an organic failure.

Proposed identifiers use `fa_c0_<platform>_<type>_v1_dNN`. They label intended content, not proof of the originating post when a shared profile link is used. E0's current attribution gaps remain explicit; C0 does not change checkout or telemetry. Aggregate E0 outcomes are shown as context, not attributed sales for drafts. Per-content performance learning remains limited until attributable observations exist.

## Google Workspace production integration

The actual Academy account can open Google Vids and the existing Freedom Audit Campaign project. It was inspected without changes. No documented public Vids timeline-authoring API was found; no such API is claimed.

- Google Slides APIs can create editable scene drafts and speaker notes. `googleProduction.createSlides` prepares these inputs without generation. The protected exact-version route is present, but production currently lacks dedicated Drive/Slides OAuth file access. `CONTENT_FACTORY_GOOGLE_ACCESS_TOKEN` is an optional server credential, not an API key and never returned to the browser. A short-lived token alone is not a durable OAuth integration.
- Vids can import Slides, turning slides into scenes and speaker notes into scripts. Aspect ratio, timings and audio still require interactive editor verification. Creation/import can be operated through UI where available; unattended product automation is not claimed.
- Drive API `files.download` supports completed Vids MP4 via long-running operations. The adapter validates an explicit Vids file ID/type and requests that operation. Automated operation polling, private asset ingestion/rendering and verified public asset delivery are not active in C0.
- No Veo, Gemini media generation, voice cloning, paid voice generation, purchase or subscription operation is invoked. No newly rendered media is claimed. Existing audio from Control A is not represented as suitable narration for a rewritten script.

References: [Vids creation/import](https://support.google.com/a/users/answer/14819770?hl=en), [Drive Vids download](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Slides API](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate), [Shorts links](https://support.google.com/youtube/answer/13748639?hl=en).

## Tests and rollback

`npm run c0:test` covers role/owner isolation, no-write reads, private-source firewall, bounded restart-safe preparation, exact version approval, failed-QA denial, transactional handoff, post-edit invalidation, checksum mutation, feedback persistence, real Meta request payloads and mocked Google API boundaries. `npm run c0:browser` uses real HTTP and disposable MongoDB with 390px/1440px Chrome, pending approval, hold persistence, reload and customer denial. E0 and Social boundary tests and the production build also remain required. The existing repository CI retains its checks; no additional manual broad M1/M2/M3 audit is requested.

Rollback C0 by disabling `CONTENT_FACTORY_ENABLED` and redeploying. It denies the queue and C0 dispatch, stops new preparation, and preserves drafts/feedback. Existing E0 and ordinary Social campaigns continue. Revert the code commit if the future Meta formatting changes need rollback. Do not delete historical content, migrate customer data or modify Core gates as part of rollback.
