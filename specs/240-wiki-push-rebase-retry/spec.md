# Spec 240 — conservation-safe pull-rebase-retry for the automated wiki push

**Classification:** Internal (CI / control-plane infrastructure). It ships no
product behavior. It defends the agent-memory recording discipline — the wiki
writes every agent makes at end of shift and on dispatch — against silent loss
when a concurrent writer advances the remote mid-session.

**Persona / job:** The affected actor is every agent that records to the wiki
(`MEMORY.md`, `STATUS.md`, weekly logs, storyboard) through the automated push
path. There is no product persona: this backstops the improvement system's own
feedback loop, the recording discipline the improvement-coach measures. When a
push is silently rolled back, a durable ruling never reaches memory and the next
session re-derives it from scratch.

## Problem

The automated wiki push refuses deterministically under a concurrent remote
writer, and there is no recovery. Evidence from 2026-07-19 → 2026-07-22:

1. **A sustained red streak with a single terminal cause.** `Agent: Shift` has
   logged **10 consecutive red runs** 07-20 → 07-22, the recurring cause across
   the streak being `wiki-conservation: refusal` on the `command: push` step —
   "refusing to push — it would drop another writer's content in MEMORY.md that
   is present on the remote." (It is the recurring cause, not the sole one: one
   07-21 red had an unrelated cause with zero refusal hits.) Confirmed in run
   `29899867229` (07-22, three jobs: product-manager, improvement-coach,
   staff-engineer) and run `29717086115` (07-20, seven refusal hits). The agents
   themselves succeed; the diff is a clean in-place edit with no
   net line drop. The refusal is not self-inflicted line loss — it is the guard
   correctly protecting lines another writer landed on the remote after this
   session booted.

2. **The concurrent writer is the event-driven dispatch lane, not sibling shift
   jobs.** `agent-shift` already runs serialized (`max-parallel: 1`), so an
   intra-matrix parallel race cannot produce these refusals. The actual writer is
   `agent-dispatch`: it is event-driven, fires on the very issue and PR comments
   the shift agents post while they work, pushes the wiki through the same push
   step, and shares no concurrency group with the shift. Any dispatch push that
   lands inside a shift job's boot→push window advances `origin/master`; the
   automated push path has no pull-rebase-retry, so the guard terminally refuses.
   Whether a given job is hit depends on whether a dispatch push happens to fall
   in its window — which is why the failures scatter rather than showing a
   first-wins-rest-lose signature.

3. **The existing interim does not cover the automated path.** The `fit-wiki
   push` conservation-guard obstacle (#84) carries a human, interactive interim:
   stage only your own file at the git layer, commit, push directly. The
   2026-07-22 evidence shows a shift agent correctly following that discipline —
   staging only its own log file — and being refused anyway on `MEMORY.md`. The
   interim protects a writer's own single file; it does not cover (i) boot-side
   `MEMORY.md` churn already dirty in the tree when the harness pushes, nor (ii)
   the automated end-of-shift push path, which re-evaluates `MEMORY.md` against a
   remote that advanced mid-shift. This failure mode has no mitigation today.

4. **The cost is silent loss of durable memory, not just noise.** Two
   consequences: red runs that are not agent errors, masking real failures; and
   rolled-back wiki writes. The 07-19 coach shift's durable #236 ruling, posted
   publicly as a comment, never reached the wiki — the superseded text stayed in
   `MEMORY.md`. Coach memory is silently losing shifts.

This is distinct from #84. #84 is the guard being *too weak* on non-`MEMORY.md`
files — a partial-tree clobber that scopes the commit to the session's own
files. Spec 240 is
*recovery* from a legitimate remote advance: the guard here works exactly as
designed, and the gap is that the automated push path cannot re-apply and retry.
The two are complementary clauses on the same subsystem, cross-referenced, not
merged.

## Scope

The automated wiki push path gains a **bounded, conservation-safe
pull-rebase-retry** that recovers from a *remote-advanced* refusal without ever
laundering a clobber. The load-bearing property is that recovery must be
structurally unable to turn a refusal the guard was right to make into a
successful push.

**In scope**

| Item | What it means |
| --- | --- |
| Recover from a benign remote advance | When the remote advanced after boot and the session's own edit drops nothing, the push path recovers and lands the write instead of failing red. |
| Re-apply only the session-authored edits | Recovery re-applies only what this session wrote — its log, claim, and section edits (the journal) — onto the current remote. It never re-applies the whole dirty working tree, so a reduction the session never authored is never re-landed. This rests on the session's edits being scopeable to its own files (the #84 dependency, see § Dependency and ordering). |
| Re-run the conservation guard at full strength every attempt | Staleness-recovery and line-conservation are independent properties: being behind the remote permits recovery; dropping remote lines still refuses. After each recovery attempt the unweakened guard decides the push. A retry succeeding a push the first attempt refused, without the tree genuinely gaining the remote's lines, must be structurally impossible — not merely discouraged. |
| Preserve every incoming remote line | Recovery keeps every line the remote gained; it never resolves a conflict in the local copy's favour over incoming remote lines. A local-favouring resolution *is* the launder. |
| The deliberate-removal override is never auto-supplied | The guard's "declare the removal if it is deliberate" escape hatch is a human, deliberate-deletion signal. Recovery must never supply it. Wiring it into auto-retry is the laundering path. |
| Bounded, fail-closed RED, never rewrite remote history | Attempts are bounded. On exhaustion the push fails RED (refuses), surfacing the failure. There is no fall-back that rewrites the remote branch's history and no silent success. |
| Discriminate structurally, not on the refusal signal | The refusal message is overloaded: it fires identically for benign staleness and for an un-authored clobber. Recovery keys on the structural discriminator — re-apply only the session's own edits, then re-run the guard — never on "the guard fired." |
| Coverage: both uncovered paths | Recovery covers both gaps the window evidence exposed — boot-side `MEMORY.md` churn already dirty in the tree, and the automated harness end-of-shift push path — not only a writer's own single staged file. |
| Conservation extended to `STATUS.md` | Today the guard protects `MEMORY.md` only; `STATUS.md` falls through it. A shift job that booted before an approval, worked, then pushed a pre-approval `STATUS.md` snapshot silently reverts the row. Recovery must cover `STATUS.md` — extend conservation to it — or the stale-tree clobber of the merge-gate surface persists even with retry. |

**Out of scope**

| Item | Why | Where it belongs |
| --- | --- | --- |
| A shared fleet-wide `concurrency` group | Rejected alternative — see § Rejected alternative. It does not queue-all, erases dispatch's per-target isolation, and does not fix the stale-tree clobber. | Rejected on the record. |
| #84's commit-scoping fix | The durable dependency this retry rests on — the ability to scope a commit to the session's own files, which is what makes re-applying only the session's edits possible. Co-tracked upstream, not re-scoped here. | #84, upstream (`forwardimpact/kata-skills` + `forwardimpact/wiki`). |
| The human interactive git-layer interim | Still valid for a human writer scoping their own file; unchanged by this spec. | #84 / `MEMORY.md` row 10. |
| Retuning the conservation guard's ruleset | This spec adds recovery around the guard; it does not change what the guard considers a drop. | A future guard-semantics change. |
| Rewriting `agent-dispatch`'s per-target isolation | The dispatch group is correct as it stands; the fix is recovery in the push path, not reshaping the event lane. | Not a defect. |

**Compatibility stance:** No clean break. Recovery is additive — a genuine
clobber (a session-unauthored reduction) stays refused exactly as today, and the
human interactive interim remains valid. Nothing that passes today fails after.

## Rejected alternative — shared fleet-wide `concurrency` group

The obstacle proposed, as an in-repo interim, one shared `concurrency` group
across every wiki-writing workflow (`agent-shift`, `agent-storyboard`,
`agent-coaching`, `agent-dispatch`, `agent-docs-review`, `monitor-spec-design`,
`kata-interview`) with `cancel-in-progress: false`, to serialize writers
fleet-wide. This spec **rejects** it as the fix, for three grounded reasons:

1. **`cancel-in-progress: false` does not queue them all.** GitHub keeps one
   running plus **one** pending per group and cancels every earlier pending run
   when a newer one arrives. `agent-dispatch` documents exactly this and keys its
   group **per target** (on the issue or PR number) so distinct issues never
   collapse into one lane. A single fleet-wide group erases that isolation: a
   burst of triage events across many issues collapses to one queue slot and all
   but the latest are silently cancelled — no red run, no surfaced failure. For
   the lane that propagates `*:approved` signals into `STATUS.md`, that is
   **silent loss of merge-gate writes**. Silent is worse than red.

2. **Serialization is not a stale-clobber fix.** Removing simultaneous pushes
   does not remove stale-tree pushes. A shift job that booted before an approval,
   works, then pushes serialized *after* dispatch propagated that approval still
   carries a pre-approval `STATUS.md` snapshot and silently reverts the row. Only
   the pull-rebase-retry closes that window, and only if it covers `STATUS.md`.

3. **It is a governance bypass-pressure vector.** Serializing the event-driven
   dispatch lane behind long shift jobs raises gate latency up to a full shift.
   A stale-looking gate creates operator pressure to admin-merge, which
   intersects the SPEC-axis admin-merge breach class (#196; the branch-protection
   precondition landed in #201). A
   control-plane change that *increases* gate latency is worth naming as a
   bypass-pressure vector, not adopting.

Serialization is therefore recorded as considered-and-rejected. If any
serialization is ever wanted for an unrelated reason, it must be a keyed or
per-target group with explicit accounting for the drop semantics above — never
one global group.

## Security review consumed

This spec consumes security-engineer's seated review on #242
([comment 5019080635](https://github.com/forwardimpact/bionova-apps/issues/242#issuecomment-5019080635)),
which raised two findings. Both are load-bearing here:

- **Finding 1 — auto-rebase-retry laundering risk.** The refusal signal is
  overloaded (benign staleness vs. a clobber that must stay refused), so the
  discriminator must be structural, not the signal. The five constraints the
  review names — re-apply only the session's own edits, not the dirty tree;
  re-run the guard at full strength every attempt; preserve every incoming remote
  line (no local-favouring resolution); never auto-supply the deletion override;
  bound and fail-closed RED, never rewrite remote history — are carried as the
  In-scope clauses above. The review's dependency note is honored: the safe retry
  **depends on** #84's commit-scoping fix; landing the retry without the ability
  to re-apply only the session's own edits builds a clobber launderer, so #84 is
  named as the upstream precondition.

- **Finding 2 — shared `concurrency` group.** The review's two concerns — the
  `cancel-in-progress: false` drop semantics that erase per-target isolation, and
  serialization not being a stale-clobber fix while `STATUS.md` has no
  conservation guard — are carried as the § Rejected alternative reasons and as
  the In-scope "conservation extended to `STATUS.md`" clause. The governance
  bypass-pressure vector the review raised is named in the same section.

The review's disposition — a spec, not a mechanical push, because it reshapes the
control plane that writes the merge-gate surface — is the reason this is written
as a spec.

## Dependency and ordering

The durable retry rests on #84's commit-scoping fix — the ability to re-apply
only the session's own edits. Both are co-tracked upstream
(`forwardimpact/kata-skills`, the compiled binary, and the `forwardimpact/wiki`
action). The cost is stated plainly: this spec cannot land its safe form until
that capability exists upstream; a recovery that re-applies the whole working
tree without it is explicitly disallowed by the scope above, because it would
re-land an un-authored reduction and only hope the re-run guard catches it.
Order: #84 commit-scoping upstream → conservation-safe retry covering
`MEMORY.md` and `STATUS.md` → drop nothing.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A benign remote advance recovers instead of failing red | a wiki push whose only conflict is remote lines another writer added after boot recovers and lands — no `wiki-conservation: refusal` red run |
| 2 | A session-unauthored reduction stays refused | a working tree carrying a reduction the session never authored ends RED after bounded attempts — the reduction never lands on the remote, and no attempt turns the first refusal into a successful push without the pushed result gaining the remote's lines |
| 3 | Recovery re-applies only the session's own edits | given a tree that also holds an unrelated change the session did not author, the pushed result contains this session's edits and the remote's advance but not the un-authored change |
| 4 | The guard evaluates the tree that is actually pushed, on every attempt | in a case where a second remote advance lands between attempts, the final pushed result reflects that second advance — a stale evaluation from an earlier attempt cannot carry a push through |
| 5 | Every incoming remote line survives recovery | after a recovered push, every line the remote held before the push is present in the pushed result; a case that would drop a remote line ends RED, not merged |
| 6 | The deliberate-removal override is never auto-supplied | a tree whose only diff is a removal (no session-authored addition) is not silently accepted by recovery — it ends RED and requires a human to declare the removal deliberate |
| 7 | Bounded, fail-closed, remote history never rewritten | attempts are capped and exhaustion yields a RED refusal; across the whole recovery the remote branch's tip only ever advances by fast-forward — no run rewrites or resets it |
| 8 | Coverage includes both uncovered paths | recovery fires on boot-side `MEMORY.md` churn already dirty in the tree and on the automated end-of-shift harness push, not only a single staged file |
| 9 | Conservation covers `STATUS.md` | a stale-tree push carrying a pre-approval `STATUS.md` snapshot does not silently revert an approval row — it is caught by the same conservation predicate now extended to `STATUS.md` |
| 10 | Per-target dispatch isolation is preserved | two dispatch events on different targets (distinct issues/PRs) arriving close together each produce their own run and each write reaches the remote — neither is silently cancelled by the fix. (The fix ships as recovery in the push path, so this isolation is untouched.) |

— Release Engineer 🚀
