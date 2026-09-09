# M1 founder validation gate — approval required

The previous `CORE_CONTEXT_WRITES_ENABLED=true` flag authorized every authenticated personal Core owner. It cannot safely support founder-only validation. Production remains paused while this correction is reviewed; this PR does not authorize activation, migration or M2.

Personal writes now require both:

- `CORE_CONTEXT_WRITES_ENABLED` exactly `true`.
- The authenticated owner's database ID in `CORE_CONTEXT_WRITE_USER_IDS`, a comma-separated list of exact 24-hex account IDs. Missing/empty lists, wildcards, role names, emails and malformed entries fail closed. A malformed entry invalidates the whole list. Whitespace and hex letter case are normalized. Neither a role nor client payload grants approval.

Every existing personal model write and canonical context transaction uses this gate. Reads remain scoped and do not require write approval. Removing an ID withdraws approval at subsequent mutation boundaries. This is a deployment gate, not M4 PermissionGrant or an ownership assignment.

Personal execution separately requires `CORE_PERSONAL_EXECUTION_ENABLED=true`, in addition to account write approval. It defaults off. Loop start, every authenticated job tick, kernel/agent evaluation, Action Kernel tool execution, system run and system automate enforce it before execution or initial state writes. Job ticks also retain persisted role and session checks. Stopping a loop remains available through its existing authorized path; boot never restores historical loops. Gate removal is not a distributed cancellation barrier for work already in flight: pause and drain/restart all processes when revoking an already-running execution deployment.

Founder validation configuration, only after separate approval of this correction:

1. Confirm the existing intended founder account and its persisted `COMMANDER_IN_CHIEF` role. Use that account's exact database ID; do not use email matching in the gate or a role-wide rule.
2. Deploy this reviewed correction while all gates remain off/unset. Confirm the deployed SHA before any activation.
3. Configure exactly that one ID in `CORE_CONTEXT_WRITE_USER_IDS` and set the write flag to `true` in the same controlled deployment/restart. Keep `CORE_PERSONAL_EXECUTION_ENABLED` unset/false. Setting the global flag alone enables nobody under this correction.
4. Run the approved context/fact/observation/task and cross-session journey. Verify another user and another operator remain unable to write or access founder records.
5. Confirm loop start and execution routes still return 503. Check Commerce/Auth, Social, and unchanged ownerless state. No live purchase, Social edits, migrations, index changes or owner guessing.

Commerce and Social do not use either Core gate. M2–M6 remain unauthorized. The current urgency-based action policy is unchanged and must not be represented as M4 permissions.

Regression coverage: configuration failures, exact-ID approval, a synthetic non-wellness journey across authenticated sessions, authoritative fact correction, explicit Task ownership, denied writes across all 26 personal models, foreign reads/references/deletion denial, execution blocked before any mutations/tools, per-tick withdrawal, historical boot quarantine, prior M1/Social/commerce/auth/build suites. All new account data and any execution-enabled settings in tests are confined to disposable local MongoDB fixtures.

Return for approval after the correction PR and CI are ready. Do not merge/deploy/activate this gate under the conditional implementation authorization alone.
