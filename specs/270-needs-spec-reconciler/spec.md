# Spec 270 — `needs-spec` reconciler: an in-tree gate that clears the label once a spec exists, ending the duplicate-spec loop

**Classification:** Internal (repository process / CI tooling). It ships no product behavior. It defends the triage pipeline against minting duplicate specs and re-stamping settled issues.

**Persona / job:** No patient-facing persona. The affected actors are the agents that run triage — the product-manager Assess loop (P2 `needs-spec` → `kata-spec`; P3 untriaged → re-stamp) and the storyboard-shift strip. It backstops every product persona indirectly: capacity spent minting a duplicate spec (spec 200 over cancelled 120 on #126) or re-triaging a settled issue is capacity not spent on the product-persona specs the team exists to ship.

## Problem

The `needs-spec` label carries two contradictory meanings depending on which loop reads it, and nothing reconciles them:

1. The PM P2 bucket reads `needs-spec` as "a spec is owed" and routes the issue into `kata-spec`.
2. The storyboard-shift strips `needs-spec` when an issue's demand is satisfied on `main`, but leaves the issue `product`-only — indistinguishable from a fresh untriaged issue.
3. The PM P3 bucket then reads that bare issue as untriaged and re-applies `needs-spec` — silently, since the product-aligned classification path applies the label with no comment and no terminal marker.

Two half-right loops oscillate on one overloaded label. A stale `needs-spec` lures a P2 run into `kata-spec`, manufacturing a duplicate — observed as spec 200 minted over cancelled spec 120 (#126, cited at `specs/200-cli-stackless-read/spec.md:7`). The label is still re-firing daily (07-24 re-add on #128/#129).

Nothing automated applies or removes the label today — verified: zero references in workflows/actions and in kata-skills @ `063d53af`. The add is a PM-triage convention; the strip is an ad-hoc shift step. There is no deterministic reconciliation of the label against whether a spec already exists. An interim `triaged` terminal marker was created and hand-applied to #128/#129 this session to exit the oscillation — a manual patch, not a durable gate.

## Scope

One in-tree reconciler — a tracked script under `scripts/` plus a `.github/workflows/` trigger — that, for any open issue carrying `needs-spec` whose spec demand is already satisfied by a positively-linked existing spec, removes `needs-spec` AND sets `triaged` in one deterministic pass, running before the PM P2 survey so a settled issue never reaches the `kata-spec` route.

**In scope**

| Item | What it means |
| --- | --- |
| A tracked reconciler | A script under `scripts/` (model: `scripts/audit-gate.js`) plus a `.github/workflows/` trigger — lives entirely in tracked files, never in an agent profile. |
| Runs before the P2 survey | Ordering only. This is documentation ordering, not code coupling into any profile step. |
| Positive-link detection by body reference | Linkage is established by a spec-PR / `spec.md` **body reference** to the issue, never by issue-number match (`#NN` ≠ spec `NN`; e.g. #60 ≠ spec 60). |
| Remove `needs-spec` AND set `triaged` | For a positively-linked issue, one deterministic pass does both — the `triaged` terminal marker moves the issue out of BOTH the P2 (`needs-spec`) and P3 (untriaged) buckets. |
| Replaces the manual strip | Once live, this reconciler is the single remover of `needs-spec`; the ad-hoc storyboard-shift strip retires. |
| Fail-safe = RETAIN on ambiguity | If a positive link is not established, labels are left untouched. A false drop silently loses spec work — worse than a duplicate. |
| Idempotent | Re-running on an already-reconciled issue is a no-op. |

**Out of scope**

| Item | Why | Where it belongs |
| --- | --- | --- |
| Applying `needs-spec` (the pre-apply guard) | This reconciler is the remove-side only. The apply-side guard (never stamp an already-spec-complete issue) is invariant (b). | Upstream `forwardimpact/kata-skills#4`. |
| Issue-number-match linkage | Explicitly forbidden — it drops specs whose number coincides with an unrelated issue. | N/A — a rejected approach. |
| Creating the `triaged` label | Already provisioned this session (facilitator-ratified; release-engineer created + backfilled). | Done. |
| Seeding the #129 citation | #129 is served-but-uncited (specs 60 + 210 serve its JTBD job but name no issue number), so the reconciler does not cover it until a `Serves issue #129.` line lands in spec 210 or 60. That is a small provenance-safe doc PR, a plan precondition — not the reconciler. | The implementation plan's preconditions. |
| Writing any STATUS row or approval | The reconciler edits labels only; it never touches `spec approved` (human-only). | N/A. |

## Constraints

- **One artifact, in-tree.** Tracked script + workflow only; never a profile step. "Before P2" is documentation ordering, not code coupling to a profile.
- **Fail-safe RETAIN.** Ambiguity → no label change. A false drop is worse than a duplicate.
- **Linkage by body reference, never number.** The detector reads spec-PR / `spec.md` body text for a positive reference to the issue; it never equates issue `#NN` with spec `NN`. A non-binding "likely composing" mention is a soft signal that RETAIN distrusts, not a positive link.
- **Replaces, not augments, the manual strip.** Once live, the reconciler is the sole remover; the ad-hoc shift strip is retired to avoid two writers on one label.
- **Deterministic, idempotent, clobber-proof.** Same inputs → same labels; re-run → no-op; it never fights another writer.
- **Least privilege.** The workflow needs only `issues: write` (label edits), consistent with the repo's least-privilege CI posture (#96). No broader scope.
- **No untrusted-code-execution path.** Parsing issue/PR bodies treats body text strictly as data — no `pull_request_target` with untrusted-head checkout, no injection or code-exec vector.
- **Linkage evidence must be trusted-source.** The body reference establishing a positive link must resolve from `spec.md` on `main` or a MERGED spec PR — never an open or unmerged PR body. An unmerged PR body is attacker-forgeable: anyone able to open a PR could plant a spec-reference to an arbitrary issue and trigger a false drop of `needs-spec` + set `triaged`, silently suppressing legitimate spec work. A forged reference is confidently wrong, not ambiguous, so RETAIN does not catch it; bounding evidence to merged/`main` state is the teeth behind the fail-safe. (The #129 citation seed lands in already-merged spec 210/60, so it satisfies this constraint.)
- **Explicit, default-deny permissions.** The workflow declares a `permissions:` block that is default-deny — exactly `contents: read` (to read `spec.md` from the checked-out tree) plus `issues: write` (label edits), and nothing else. Never `write-all`. Reading evidence from the tree rather than open-PR bodies means no `pull-requests: read` is needed.
- **Untrusted text is inert data, enforced.** No `${{ github.event.* }}` value is interpolated into any `run:` or inline script; untrusted issue title/body/label reach the parser only through `env:` bindings, consumed as data (via `actions/github-script` or a file read), never string-concatenated into a shell or `eval`. The link matcher is strict-anchored; a spoofable substring match counts as ambiguous and RETAINs.
- **Pinned supply chain.** Every `uses:` is pinned to a full 40-character commit SHA, never a tag or branch; the `github-actions` ecosystem is covered by Dependabot so the pins stay maintained; action surface is minimized (prefer first-party `actions/github-script`). No third-party action receives `secrets.GITHUB_TOKEN`.
- **Trigger: `schedule` + `workflow_dispatch` only.** Base-repo context, scoped `GITHUB_TOKEN`, no untrusted head. The workflow MUST NOT use `pull_request_target` nor `workflow_run` — both are privileged-context traps. (If `issues` typed events are ever added later, guard with a `concurrency` group and an early no-op when the issue is already `triaged`, so the workflow's own label writes do not self-retrigger.)
- **Audit every decision.** The reconciler logs each decision — the issue, the resolved link, and the retain-vs-mutate outcome — so a silent false-drop or a linkage-spoof attempt is detectable after the fact.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The reconciler is a tracked script + workflow, not a profile step | files exist under `scripts/` and `.github/workflows/`; no agent profile is modified |
| 2 | An open `needs-spec` issue positively linked to an existing spec (by body reference) has `needs-spec` removed and `triaged` set in one run | a fixture issue transitions from `needs-spec` → `triaged`, `needs-spec` absent |
| 3 | Linkage is body-reference only | a number-collision fixture — an issue whose number matches a spec number but is not referenced in that spec's body — is NOT cleared (#60 ≠ spec 60) |
| 4 | Ambiguous / soft linkage → RETAIN | an issue whose only signal is a non-binding "likely composing" mention is left untouched |
| 5 | Deferred-no-spec issue passes untouched | #60 (deferred, no spec) retains its labels unchanged |
| 6 | Idempotent | a second run on a reconciled issue makes no label change |
| 7 | Runs before the P2 survey and replaces the manual strip | ordering is documented; the storyboard-shift no longer strips `needs-spec` by hand |
| 8 | Least-privilege token | the workflow declares only `issues: write` |
| 9 | The known cases behave correctly | #128 (cited by spec 140 at `specs/140-cross-trial-interest-overview/spec.md:3`) is cleared + `triaged`; #129 is covered only once its citation seed lands (a plan precondition), and the spec states this so the plan carries it |
| 10 | Linkage evidence resolves only from `spec.md` on `main` or a merged spec PR | a forged-reference fixture — a spec-reference to the issue that exists only in an open/unmerged PR body — does NOT trigger a drop; it RETAINs |
| 11 | The workflow `permissions:` block is default-deny, exactly `contents: read` + `issues: write` | the workflow file declares only those two scopes; no `write-all` |
| 12 | Untrusted text never reaches code execution | no `${{ github.event.* }}` is interpolated into any `run:`/inline script; untrusted text flows via `env:` only; the matcher is strict-anchored |
| 13 | Actions are SHA-pinned and Dependabot-maintained | every `uses:` is a full 40-char commit SHA; the `github-actions` Dependabot ecosystem is enabled |
| 14 | The trigger is base-context only | the workflow triggers on `schedule` + `workflow_dispatch`; `pull_request_target` and `workflow_run` are absent |
| 15 | Every reconcile decision is logged | the run log records issue, resolved link, and outcome for each processed issue |

— Product Manager 🌱
