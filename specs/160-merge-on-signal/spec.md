# Spec 160 — merge-on-signal: trigger the release gate on the approval signal, not the schedule

> **Terminates RFC #181** (converged 2026-07-11, ADOPT-WITH-AMENDMENTS: release
> + staff + security + PM). This spec owns lever **(B)** — the gate trigger. It
> does **not** author lever **(A)**, the `#64` co-scheduling checklist (PM-owned),
> nor the branch-protection teeth (out of scope, named below).

**Classification:** Internal (governance / CI infrastructure). No product
behavior ships. It defends the integrity of the Item-1 governance experiment —
`spec approved → design merged ≤ 1 shift`, THROUGH the `kata-release-merge` gate
— that the whole agent team depends on to prove its lifecycle works.

**Persona / job:** No direct product persona. It protects the release gate's
sole-external-merge-point invariant, which indirectly defends every persona job:
a design that reaches `main` only through the gate is a listing/summary the
patient, staff, and physician surfaces can trust was reviewed.

## Problem

Item-1 (binding) needs a design PR to reach **`design merged` on `main` within
one shift of `spec approved`**, and to do so THROUGH the gate rather than around
it (strict-hold #98/#101). Two latencies stand between the approval signal and
the merge. This spec kills the second one.

1. **The gate runs on a fixed schedule, not on the signal.** `kata-release-merge`
   executes only when the release-engineer's scheduled Shift fires — three fixed
   cron passes a day (night / day / swing). Measured inter-pass gaps run
   **1h04m to 6h14m** (trace `29045911582`). A trusted-human approval signal that
   lands mid-gap leaves a clean, green, mergeable PR sitting with **no gate
   action for up to ~6.2 hours**.

2. **That vacuum is the documented cause of lost pilots.** Pilots 20, 40, and 50
   were admin-merged by a human filling exactly this wait (#137) — destroying the
   Item-1 forward proof and breaching strict-hold. The vacuum does not merely
   delay; it manufactures the pressure that produces the invariant breach.

3. **The reactor already wakes on the signal, but not into the gate.** The
   Dispatch reactor already fires on an `*:approved` label-add and on a submitted
   review. Today it wakes the facilitator, **not** a `kata-release-merge` gate
   pass. So an approval signal on a ready design PR does not currently trigger a
   prompt merge — the PR still waits for the next scheduled Shift.

4. **The schedule window is also an unpriced detection margin.** Under the
   current cadence a mis-applied or spoofed approval signal has up to ~6.2h of
   human visibility before anything merges. Collapsing the window to minutes
   spends that margin: a bad signal would auto-merge unattended. Merge-on-signal
   is therefore only safe if it carries a signal-authenticity contract stronger
   than today's implicit one — the G1/G2/G3 guarantees below, verified by SC3
   (G1), SC4 (G2), and SC5 (G3).

This spec collapses lever B (the gate's structural lag between *signal lands* and
*gate merges*) to minutes, leaving lever A (the human gap between the two ordered
signals, PM-owned) as the only remaining Item-1 risk.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Merge-on-signal trigger | On an enumerated approval signal on a `gate:in-flight` **design** PR — a `design:approved` label-add or an APPROVED review — a `kata-release-merge` gate pass is dispatched within minutes, instead of waiting for the next scheduled Shift |
| Gate-body identity | The signal-triggered pass performs the **full, unchanged** gate body: trust verification, PR classification, rebase-on-`main`, CI-green requirement, the `wiki/STATUS.md` ledger / enumerated-signal gate, and the bot merge. The signal is a trigger only — it is never a substitute for any gate check, never originates approval, never writes a ledger row, and never enables admin-merge |
| Signal-commit binding (G1) | An approval signal counts only for the exact PR head commit it was emitted against — the **human-approved head**. Any change to the PR head after the signal — by the author or any external actor — invalidates it and re-requires approval; the gate does not merge a head a contributor changed after approval. The gate's own rebase-on-`main` (the Gate-body-identity row) is exempt — **not** an invalidating event — **only when it replays the reviewed diff unchanged**; a conflict-resolving rebase that alters the tree the human reviewed re-requires the signal. So the exemption never transfers a human's approval to a tree they did not review, yet a clean rebase does not perpetually kill the gate's own trigger |
| Trusted-actor gate (G2) | An approval signal counts only when the actor that emitted it belongs to the strict-hold trusted human set; never the bot. Signal state `APPROVED` is necessary, not sufficient. The concrete membership source is a design decision |
| Least-privilege trigger surface (G3) | The signal-triggered path exposes no privileged-input surface beyond what the scheduled gate already exposes: it runs with the least privilege its merge requires and never lets untrusted PR-supplied content reach a privileged operation. It is no more exploitable than today's scheduled gate |
| Draft-hold retirement note | Governance documentation records that merge-on-signal supersedes the pre-flight draft-hold pattern, so future design PRs need not be held in DRAFT before their spec lands on `main`. This spec delivers the documented note only; staff-engineer performs the actual retirement when the trigger lands |

The `design:approved` label the trigger keys on does not exist in the repository
today (only `gate:in-flight` and the spec-side approval label do); establishing
that label is part of this change.

**Out of scope:**

- **Branch-protection "require gate merge".** The durable mechanical teeth that
  would make an admin-merge structurally impossible is a distinct,
  upstream-sequenced repository-settings change. Named here as the eventual
  durable substitute for both the draft-hold and the visibility marker (#165);
  not implemented by this spec.
- **The (A) co-scheduling checklist** on `#64` and the staff coupled-signal leg
  `#179`. PM- and staff-owned; this spec points to them, does not author them.
- **Widening the trigger** to `spec:approved`, to non-design PRs, or to any other
  `*:approved` label. Narrow-first for the pilot; widening is a later change
  after a clean forward proof.
- **Executing the draft-hold retirement.** This spec states the requirement;
  staff-engineer performs the retirement when the trigger lands.
- **The propagation of the signal into the STATUS.md row.** That hop is the
  existing gate/dispatch behavior and is unchanged here; this spec changes when
  the gate runs, not how a signal becomes a ledger row. SC2's "no ledger-approval
  write" means the trigger itself originates nothing — it does not add a new
  ledger-writing path.

## Success criteria

1. An enumerated design-approval signal from a trusted human on a
   `gate:in-flight` design PR — a `design:approved` label-add or an APPROVED
   review — causes a `kata-release-merge` gate pass to be dispatched within
   minutes rather than at the next scheduled Shift — verify by a trigger run for
   each signal form showing a gate pass launched off the event.
2. The signal-triggered gate pass reaches the same merge decision a scheduled
   pass would on the same PR state and completes as an ordinary bot gate merge,
   never an admin-merge and never a ledger-approval write — verify by running a
   signal-triggered and a scheduled pass against an identical PR and comparing
   the decision, the merge method, and that no ledger row was written.
3. (G1) A commit a contributor pushes to the PR head after the approval signal
   does not result in a merge; the stale signal is rejected — verify by a
   scenario: approve, contributor push, confirm no merge. The gate's own
   rebase-on-`main` that replays the reviewed diff unchanged is not such a push
   and does not invalidate the signal; a conflict-resolving rebase that alters
   the reviewed tree does re-require it.
4. (G2) An `APPROVED` review or `design:approved` label from an actor outside the
   trusted human set does not trigger a merge — verify by a scenario with a
   non-trusted actor.
5. (G3) The signal-triggered path exposes no privileged-input surface beyond what
   the scheduled gate already exposes — verify by a security review of the
   trigger against the existing Dispatch trust-gate posture.
6. The trigger does not fire for approval signals on non-design PRs or for other
   `*:approved` labels — verify by scenarios that a spec-side approval label and
   an approval on a non-design PR each launch no gate pass.
7. CONTRIBUTING.md (or the governance reference it points to) records that
   merge-on-signal supersedes the draft-hold pre-flight pattern — verify the
   documented text.

## Why now

The forward Item-1 pilot is live: spec-60 (`#64`) is the first product-persona
spec approaching `spec approved`, with its design pre-positioned on `#172`. The
first `spec approved` signal is a scarce event the team cannot afford to waste on
a timing miss. Merge-on-signal ensures that once both ordered signals land, the
gate merges the same shift — so the pilot measures signal cadence (lever A), not
gate lag (lever B).
