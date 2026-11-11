# Draft: retained Freedom Audit continuity

PR #122 replaces the manual phase-only proposal. Nothing is deployed or enabled by this draft.

One complete customer-facing audit snapshot is retained in existing owner-scoped StrategicMemory only after source review and explicit consent. Server reads the source from the authenticated owner's UserProfile; clients send an ID, source hash and expected retained revision, never source text. Recommendations and self-reported inputs remain unverified context, excluded from ordinary memory facts. Technical provider metadata and the redundant manual prompt are not copied.

Retention lasts until explicit replacement/removal or personal Core erasure and can outlive the original last-ten result history. Replacement/removal invalidates derived guidance and conversation through the existing transaction lifecycle. Original audit results and purchase records are unchanged. Same-source retries abort the transaction and leave evidence revisions, saved guidance and the retained record unchanged. Generic memory read/search/kernel paths exclude retained sources; generic editing and deletion reject them. Vision context excludes the retained source. Retention and selection retain existing Core write authorization gates; paid entitlement is required for import, reading full content and model use, but not removal.

Both legacy text analysis and M3 directly retrieve the retained source on subsequent turns, independently of the 700-character conversation excerpts and recency-limited memory lists. Revision/hash checks reject generation if the source changes or is deleted in flight. The default selection includes the whole retained customer audit. A user may explicitly select an overview or phase; responses disclose omitted fields. The full copy remains readable and unchanged. This is bounded retrieval, not a claim that every audit can fit every model or that generated guidance is satisfactory.

## Limits and release decisions

- Snapshot limit: 256 KiB UTF-8; selected audit context: 32 KiB. No silent truncation of audit data. Oversized requests stop before provider calls.
- Set FREEDOM_AUDIT_MODEL_INPUT_BUDGET_BYTES explicitly (4096–65536) for the selected model, after reserving output/thinking capacity. This checks the complete text prompt in UTF-8 bytes, not model tokens. Independent review must validate a conservative allowance against the configured provider and any provider-added framing. The current M3 adapter defaults to 4096 output tokens and leaves thinkingBudget provider-default unless supplied; legacy modelRouter does not set an output cap. Therefore the byte guard alone cannot certify end-to-end token headroom. Independent review must settle provider/model-specific input, output and thinking reservations before enabling this feature. No production setting has changed.
- One retained audit at a time; no new datastore, embeddings, subscription or provider call for retention. No automatic semantic retrieval. This avoids lossy summaries and uncontrolled token costs; explicit selection adds a user step for oversized context.
- Covers text paths only. Media analysis does not import retained audit context. Original source audit retention and existing Core deletion policy are unchanged.
- Dedicated owner-authenticated, revision-checked deletion remains available after entitlement/allowlist removal and while ordinary writes are paused. A server-only scoped authority permits only this deletion lifecycle and dependent redaction; ordinary write routes remain gated. Review this explicit privacy exception before deployment.
- Independent review required for consent language, lifecycle/race handling, model budget, ownership and UI before merge or deployment. Synthetic tests prove boundaries and retrieval, not real-world plan usefulness or live fulfillment.

## Focused verification

server/tests/freedomAuditContinuation.test.cjs uses isolated Mongo and mocked providers: ownership, consent, concurrent retry, source eviction, long conversation, memory recency, proposal classification, validator-valid large Unicode plans, prompt boundaries, deletion during legacy and M3 generation, Core erasure and revoked entitlement. freedom-audit/tests/auth.test.cjs verifies explicit consent and stale-account review rejection. No live model or payment calls.
