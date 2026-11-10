# Draft: preserve public dialogue
Changes only future responses. Previously discarded assistant text cannot be recovered by this patch. This does not restore or identify a historical model, prove an external transmission, enable execution, or change runtime gates.

The legacy text route validates its five public arrays and stores the same complete labeled response returned to Dashboard. Malformed/oversized responses fail without a partial append. Its recent context includes whole turns (12 turns / 24,000 serialized characters), instead of the first 700 characters of each turn.

M3 accepts a bounded, reference-validated public interpretation with explicit uncertainty. Analyze/reflection can proceed without an active goal; goal-linked proposals retain selected-owner-goal validation. Prioritization without goals must ask for selection. Mentor/recommend/planner goal gates remain unchanged. The operational summary remains separate. Dashboard receives the same public conversational text saved in the existing owner-scoped Memory path.

No new memory store or automatic promotion into facts/observations/Patterns. Existing provenance, freshness, deletion, transaction and account checks remain. Corrections in dialogue remain attributed to their speaker. Canonical corrections still invalidate conversation through existing M1 policy.

Bounds: stored conversation remains 80 turns, 6,000 characters per turn. Conversation requests above 6,000 characters fail before generation; preview limits stay unchanged. Public dialogue above 6,000 fails before append rather than silently truncating. M3 still budgets scoped context at 65,536 bytes, omits oldest whole conversation turns first and retains the latest two; if those cannot fit after the other bounded collections are trimmed, generation fails. Coverage reports omissions. This is recent bounded continuity, not unlimited recall.

Synthetic HTTP tests cover late assistant details, exact response/reload equality, subsequent prompts, both speakers and corrections, no-goal reflection, derivative classification, foreign-owner isolation, limits, malformed output and deletion races. Existing M3 integration, Pattern and provider tests remain required. Mock responses prove transport/persistence and validation, not actual Gemini adherence or subjective quality.

PR #122 touches the same route/context files. Its retained-audit retrieval, entitlement, budget, freshness and deletion checks must remain intact when combined. Do not deploy either draft without review.
