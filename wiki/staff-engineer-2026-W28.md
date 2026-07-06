# Staff Engineer — 2026-W28

## 2026-07-06

### Session — Team storyboard (2026 July review)

Participated in the July storyboard as a domain participant (facilitator: lead).
Answered Q1–Q5 via Answer; contributed to both Step-7 RFCs via Announce.

**Q2 — current condition (measured, recorded to metrics CSV):**
- specs_awaiting_design=4 (specs 20/30/40/50 `spec approved` on origin/main, no
  design-a), designs_merged=1 (spec 10 #57), specs_awaiting_plan=0 (spec 10 has
  its plan; no other design on main). All three `insufficient_data` (n=2–4, no
  μ/limits/signals) — honest read of a 3-day-old measurement system.
- **Item-1 proof case fired:** spec 10 `spec approved` (#33, 07-04 14:25Z) →
  design-a merged (#57, 07-05 07:12Z) = **16h47m, within one shift**. Advanced
  further to `plan approved` (#65 merged). Only the implement leg is unproven.
- Status change since 07-04: the approval-starvation constraint loosened at my
  stations — design backlog went 0→4 by real approved demand (not starvation);
  designs_merged 0→1 is a real merged design, not a vacuous zero.

**Q3 — binding obstacle: #43** (spec→design trigger; no automated dispatch on
merge-to-main). Transitioned vacuous→actively-binding this shift as
specs_awaiting_design went 0→4; each queued spec accrues unbounded hand-driven
latency toward the one-shift target. Evidence recorded: issuecomment-4891980184.
Distinguished it from the implement leg (a next-step, not a blocker). Correction
logged to the lead's routing: #43 is **not** co-blocked with release's #39 on the
human signal — exp-23/#28 already merged as a *gauge*; the dispatcher upgrade is
plain code I can pick up any cycle, so #43 is priority-deferred, not blocked.

**Q4 — experiment: #74** (`experiment` + `agent:staff-engineer`). Implement
spec 10 on `feat/10-eligibility-precheck` off the merged plan-a. Single-metric,
single-skill prediction: **implementations_shipped latest 0→1** (kata-implement),
≤1 cycle. Chosen over the #43 dispatcher per the target's tiebreaker (one spec
proven end-to-end > breadth); also produces the first artifact that can exercise
release's unexercised gate (#39).

**Q5 — checkpoint:** #74's implementation PR discharging through the real
`kata-release-merge` gate this cycle — proves the full arc
spec→design→plan→implement→gated-merge on one patient-facing spec. Rides an
already-`plan approved` plan (agent-writable per STATUS trust rule), so needs no
new human `spec:approved` — dischargeable inside staff+release control,
decoupled from approval starvation. Flag (not re-litigation): #74 is the first
artifact to test spec 10's approval chain at the gate; spec 10's `design
approved` rests on the #57 human-merge signal our settled (B) position deems
inert, so that latent origination question surfaces at #39 — release's call, not
mine. Kill condition: if the plan can't satisfy the build+5-suite regression
carry without design changes, stop and route back — don't paper over a plan
defect at implement time on a clinical-eligibility surface.

**Step-7 RFC contributions (Announce):**
- rfc_1 (value legibility, owner PM): proposed the `{next stage · owner · SLA}`
  next-action row for the approval dossier; insisted it expose #43 honestly
  (design SLA is best-effort until the dispatcher lands).
- rfc_2 (measurement convention, owner TW): signed off; contributed **clause 6 —
  gaps stay gaps: a missing day is a missing point, never zero-filled or
  interpolated** (distinct from collapse, which handles too-many same-day rows).
  Adopted. rfc_2 converged at 6 clauses across TW/RE/staff, awaiting PM+security
  to ratify. I have a real 07-05 staff-lane gap that made the rule concrete.

### Next

My own Assess run: execute #74 (kata-implement spec 10). Route 3 is live off
`10 plan approved`; route 1 (design specs 20/30/40/50) is the standing backlog
behind it.

— Staff Engineer 🛠️

## 2026-07-06

### Decision

**Surveyed:** Grounding conflict (facilitator ask#3): rel-eng read 30/50 as 'spec draft' vs my 'spec approved' on origin/main; and facilitator's read of my claim design/security-migrations-30-50 as lockstep

**Alternatives:** Treat as lockstep (would wrongly skip/duplicate spec-approval); edit working-tree STATUS.md (rejected — drift reset is a separate wiki-sync concern, not to be swept into this)

**Chosen:** Canonical origin/main (2a26526, fetched 11:09:32Z): 20/30/40/50 all 'spec approved' since #67 (4e79839, 05:27:45Z); only later ledger write is #65 (row 10). Not a race — rel-eng read the drifted working-tree STATUS.md (still M: 20-50 spec draft + phantom 60/70). 30/50 route as FORWARD DESIGN from spec-approved (spec approved -> design draft -> design approved), NOT lockstep — #67 restored genuine human spec-approval (Dick Olsson merges #31/#29), so the gate lockstep would skip is not missing

**Rationale:** Lockstep only applies when spec-approved is absent and spec+design ship together to subsume it; here spec-approved exists with human provenance, so a plain design pass is correct. Recording so the design/security-migrations-30-50 claim is not re-read as lockstep and does not misroute

### Designs authored — specs 30 + 50 (facilitator greenlight ask#4)

Route-1 pass on the two coupled security migrations (top product priority,
review_by 2026-07-24). Both `spec approved` → **`design draft`**; PRs **#78**
(design 30) and **#79** (design 50), one per spec. Product-lane requirement
honored: each `design-a.md` opens with the 2026-07-24 deadline + a named-advisory
decrement table (countermeasure to #44/#46).

**Design 30 (vitest 2→3):** WHICH/WHERE for Path 2 (spec-resolved) — keep
`vitest@3.2.6`, add floating `overrides:{vite:^6.4.3}` at the **root** manifest
(bun honors overrides only at workspace root; verified no existing block).
Clears the 9.8 crit + vite high + 3 vite/esbuild moderates. **Panel caught two
real defects I inherited from the spec:** (1) `postcss` (`GHSA-qx2v`) is NOT a
vitest/vite-tree id — the vulnerable copy is `next/postcss@8.4.31` (bun.lock:1026,
pinned by next@14.2.35), so it's **Spec 50's** decrement; vite already resolves
safe `postcss@8.5.16`. (2) Baseline cleanup is **2** entries not "6/5" —
`security/audit-baseline.json` threshold is crit/high, so only `GHSA-5xrq` +
`GHSA-fx2h` are baselined; moderates were never in it. Both routed to product as
a one-line spec correction (transitive table + criterion-6 wording).

**Design 50 (next 14→15):** WHICH/WHERE = the Next-15 async request-API boundary.
`params`/`searchParams`/`next/headers` cookies() become Promises → 4 param pages
+ 4 searchParams pages + 3 param handlers + `buildAdminCtx` = 11 files. `NextRequest`
(`.cookies`/`.nextUrl`) stays sync → `buildCtxFromRequest` untouched. Target
15.5.18 (spike floor), React held at 18.3.1, force-dynamic masks the caching flip.
**Panel caught two consensus Highs:** (1) the 5 test suites call pages with sync
object literals (`await TrialPage({params:{id}})`) — they ARE in the async blast
radius, must wrap in `Promise.resolve`; (2) type gate is `next build` (criterion
4, type-checks by default), NOT `just lint` (eslint+deno only) — spec 50 criterion
5 has no tsc, unlike spec 30 criterion 5.

**Process:** kata-review technical panel of 3 per design; design 30 took 2
revision rounds + a confirmation pass, design 50 took 1 round; all Blocker/High/
Medium resolved, findings verified against the tree. Designs are human-ready and
await a trusted `design approved` signal on STATUS rows 30/50 (human-only).

### Next

Design-approval turnaround on 30/50 is the binding latency (facilitator tracking
it). On approval: route-2 kata-plan for each. Standing route-1 backlog behind
them: specs 20/40 still `spec approved` with no design.
