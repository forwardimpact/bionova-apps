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

### Implement run — spec 10 (exp #74), DEFERRED to concurrent PR #80

Executed kata-implement for spec 10 in a worktree off `10 plan approved`: built
`buildPreCheck` (eligibility-view.js), wired `checkEligibility`, rewrote the CLI
template, wrote builder/handler/template tests. All gates green (42 handler
tests, eslint, tsc, C5 rg guard) and a clean 3-reviewer panel (no blocker/high;
fixed the Medium null-halves gap + Lows: decimal-age throw, em-dash copy,
unknown-score fallback, populated-against render).

**Deferred at the pre-open freshness probe.** `git fetch` revealed **PR #80**
(`app/kata-agent-team`, same `feat/10-eligibility-precheck` branch, same six
files, CI-green, MERGEABLE, created 11:23:19Z) — a *concurrent* staff-engineer
run had already implemented spec 10. Per the #57/#58 dedup discipline I did NOT
push a competing PR (my branch was local-only); removed the worktree, discarded
my 3 commits. #80 is the artifact of record. Contributed my panel's one
substantive finding to #80 as a comment (#80#issuecomment-4892233460): the
integer-only age regex throws on a valid decimal age — fix supplied.

`implementations_shipped` this run = **0** (no PR opened; deferred). #80 ships
the spec, so the arc spec→design→plan→implement is demonstrated end-to-end on
spec 10; only gated-merge (release #39) remains.

**Coordination lesson (thrash — third instance of this root):** two
staff-engineer dispatches ran the implement route on spec 10 concurrently; both
`fit-wiki claim`ed the same branch (both claims present in Active Claims) and
both built full implementations. Claim-before-act serializes only *sequential*
runs — a run that boots before my claim lands never sees it. Same root as the
id-10 rename thrash and the #58 design dup. The durable fix is single-owner
dispatch of a route (coach/release gate), not per-agent claims — flagged on #74.
Released my claim; posted the collision to #74 (issuecomment-4892236173).

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

## 2026-07-06

### Decision

**Surveyed:** Assess routes 0–4; handed task via facilitator ask on experiment #74

**Alternatives:** Self-pick from Assess (routes 1/2/4) — declined; task was explicitly handed

**Chosen:** Route 3 — kata-implement spec 10 (eligibility-precheck) on feat/10-eligibility-precheck

**Rationale:** plan-a.md on origin/main, STATUS row 10 = plan approved, no open PR/claim touching spec 10; facilitator green-lit #74

### Spec 10 implemented — PR #80

feat/10-eligibility-precheck: buildPreCheck view-model builder + checkEligibility wiring + CLI template rewrite + tests (39/0). C1–C5 covered; C5 rg guard clean. kata-review panel of 5: zero blocker/high/medium, B4b added. Two plan deviations flagged to product (fallback copy → two sentences per CLAUDE.md style; synthetic custom[] test doubles keep C5 guard clean over all products/). STATUS plan-implemented row left for the merge signal. Routed to release-engineer on #74.

### Spec 20 designed — PR #83

Route-1: specs 20/30/40/50 `spec approved` on origin/main, no design. The
top-priority pair 30/50 were already delivered this day by a concurrent
staff-engineer instance (**#78/#79**, panel-reviewed) — discovered mid-run when
my duplicate `design/30` push was rejected. My independent 2-panel review of
#78/#79 **converged** with their panels (broken mermaid `||` edge label avoided;
"8 dynamic pages + directive-less home" stated correctly; home caching-flip
risk-row present), so no PR comment needed. Cleaned up the duplicate worktree and
stood down on 30/50.

Picked up the standing route-1 backlog the prior run flagged: **spec 20**
(Deno version-pin advisory check). Spec 40 is a follow-on to 20 and depends on it
landing — designing 40 first would be premature, so 20 is the clean next design.

**Decision:** reuse `scripts/audit-gate.js` **unchanged** as the verdict engine
via its two seams — `AUDIT_JSON_FILE` (replaces the `bun audit` call) and
`argv[2]` baseline path. A new producer (`scripts/deno-audit.mjs`) queries OSV by
ecosystem+version for the two pins and synthesizes the exact `flatten()` shape.
Satisfies "behave identically to #26" + "don't weaken any existing gate" by
construction. **CI host redirected** from the spec's advisory `check-edge` Note
to `check-audit.yml` — a reviewer traced that #26 actually lives there (bun
runtime, nightly cron already present, isolated on purpose); check-edge is
deno-runtime with no cron. Flagged the divergence for the approver. SC5 doc body
already merged (#37); design owns only the tense+host-reference flip.

**Process:** 2-reviewer kata-review panel on local `design-a.md`; central reuse
claim verified line-by-line against `audit-gate.js`. All Blocker/High/Medium
addressed — incl. pinning the two OSV→shape false-green/false-red traps (GHSA
advisory URL selection; lowercase severity enum) in the Interfaces section, and
the check-edge→check-audit host redirect. 107 lines.

### Next

Design-approval turnaround on 30 (#78) / 50 (#79) / 20 (#83) is the binding
latency. On approval: route-2 kata-plan each. Route-1 remainder: **spec 40**
(deno-graph migration) — but hold until spec 20 is at least designed-approved,
since 40's premise is retiring 20's disclosed boundary. Spec 10 implemented (#80)
awaits the merge + `plan implemented` STATUS signal.

## 2026-07-06

### Spec 40 designed — PR #86 (route-1 remainder)

Authored `design-a.md` for spec 40 (Deno resolved-graph audit coverage). Route-1
gap: 40 was the one `spec approved` on `origin/main` with no design (20/30/50
already have design PRs). 125 lines. Clean 3-reviewer kata-review panel (2
staff + 1 security).

**Load-bearing finding.** The spec frames the work as an `esm.sh → npm:`
migration so `supabase-js`'s tree becomes auditable. The code says otherwise:
`@supabase/supabase-js` is **dead code** — present only in `import_map.json`, no
module imports it, all four functions reach Postgres over PostgREST + `fetch`.
So the design takes SC1's **removal** branch: delete the unimported esm.sh
specifier (retiring the blind spot at the source), then lift Spec 20's Deno gate
from a pin-string lookup to a scan of the resolved `deno.lock` npm tree by
changing only the producer's **input**; the #26 verdict engine is reused
unchanged. Empty npm tree today is honest-clean, not false-green — the producer
logs the resolved package count and SC2's throwaway-PR check proves the gate
fires.

**Panel fixes (planner context).** `std` is a **production** import
(`embed-seed/mod.ts` path-traversal guard), not test-only — corrected D4 so the
best-effort disclosure reads as load-bearing. Assigned the resolved-count log
line to the producer (the honesty guarantee was unowned). Named the
fixture-lock test seam (resolved-graph analogue of `AUDIT_JSON_FILE`) for
hermetic SC2 verification. Spelled out SC1 removal-branch verification (spec's
verified-by cell describes only the migration branch — flagged for upstream
tightening, not re-authored).

**Judgment call — overrode my own prior hold.** Last session's "Next" said hold
spec 40 until spec 20 is design-approved (#83 not yet approved). I proceeded
because the design is fully dependency-aware (states it cannot land ahead of
Spec 20 per SC5 precondition; rebases if #83 shifts) and the dead-code finding
materially reshapes the work independent of Spec 20's approval. Surfaced to the
human in the PR and session so they can redirect if they'd rather wait on #83.

### Next

Approval turnaround remains the binding latency: 20 (#83) / 30 (#78) / 50 (#79)
/ 40 (#86) all await `design approved`; on each, route-2 kata-plan. Spec 40
still cannot merge ahead of Spec 20. Spec 10 (#80 shipped) still awaits the
`plan implemented` STATUS signal on `main` — the ledger shows `plan approved`;
that flip lives in a local scratch edit, not yet on `main` (route-3 residue).

### Fast-follow filed — #89 (deferred, staff-engineer owns)

Filed the carried-forward [Low] fractional-age fail-loud finding as mechanical
fast-follow **#89** (facilitator ask#5; PM drafted the body, I own the fix).
Severity locked [Low] after the facilitator traced the web submit route — it
builds `custom_answers` from boolean `answer:<criterion>` fields only, no numeric
age input, so no web-patient surface; live only on CLI + direct API POST.
Fix: reject non-integer age at the accept boundary (`num()` in
`eligibility-check/mod.ts`), keep the grammar-drift `throw` in
`eligibility-view.js` intact. **Sequencing gate:** deferred until the next
`eligibility-check/mod.ts` touch (specs 20/40 / security pair) to avoid a merge
collision — encoded via the `deferred` label + issue Sequencing line. Pick it up
on that next edge-function change.

Also cleared the #64/#68 renumber body residue (release-engineer FYI): swept the
stale spec-identity refs (80→60, 90→70, dir paths, cross-ref) via `gh api PATCH`;
left the PM's reserved-id/ledger-reasoning lines for the PM, flagged via a PR
comment on each.

### #89 shipped — PR #92 (facilitator ask#1; re-routed off mod.ts)

Facilitator un-deferred #89 and re-routed the fix to the **handler** boundary,
not `mod.ts` `num()` as the PM body proposed. This is the better call and it
**dissolves the sequencing gate**: the fix is in `check-eligibility.js` +
`eligibility-view.js` only, so it never touches `eligibility-check/mod.ts` —
no merge collision with specs 20/40 / the security pair, no need to wait for the
next edge-function edit. Engine untouched in the strongest sense (X1): the
scorer isn't even invoked on the reject path.

Grounded scope widening (called out to facilitator for sign-off): the gate
rejects **negative** integers too, not just non-integers — the scorer emits
`Age ${req.age} …` verbatim and `AGE_RE`'s `\d+` rejects a leading minus the
same way it rejects a decimal, so `-3` crashes via the identical throw. One
boundary predicate (`isAgeInputValid`) closes the whole crash class. Absent/blank
age untouched (still → scorer "Age not provided" → existing "add your age" line).

Design: reject with a specific "enter a whole number of years" outcome (summary +
one line in the existing unclear section), not the missing-age bucket and not a
silent floor. No signal recorded on reject. Parameterized handler test covers
fractional-string / fractional-number / negative / non-numeric; 44 handler tests
pass, eslint clean. Labels: −deferred −enhancement +bug. Handed to
release-engineer for the merge gate.

### Session — 1-on-1 coaching (design leg, facilitator)

Answered Q1–Q5 via Answer. Focus: the design leg is the pipeline's tightest
constraint — 0 designs merged to `main`, 4 specs at `spec approved`.

**Current condition (measured, ref 2026-07-06T14:51Z):**
- Designs merged to `main` = **0** this batch; `design`-phase rows on `main` = 0.
  All-time `design approved` ever reached = **1** (spec 10), advanced to
  `plan implemented`.
- Design PRs #78/#79/#86 OPEN 3.0–3.5h, all **CI-green** (9✓ each); parent specs
  20/30/40/50 `spec approved` since `4e79839` (05:27:45Z), spec-approved→now
  **~9h23m** with merged-count 0. Spec 20 has no design PR.
- Agent merge gate has merged a design **0 times all-time** — #57 (spec 10) was
  **hand-merged by a human** (dickolsson), not `kata-release-merge`.
- Mechanical gap found: design PRs touch only `design-a.md`, so `main` had **no
  `design draft` row** for a `design approved` signal to land in.

**Obstacle — committed #39** (owner: release-engineer): the approval→merge path
for a design is unproven; two links never fired — `design approved` signal (0/4)
and the agent merge gate (0 all-time). Confirmed #39 binds and my #43 does not
(#43's trigger premise is discharged — watcher merged, designs authored). Sharpened
#39 (issuecomment-4894223901); marked #43 discharged/migrated (issuecomment-4894225773).

**Experiment — #98** (`experiment`+`agent:staff-engineer`): seat the pilot
`30 design draft` routing row on `main`. Pilot = **#78** (vitest 2→3, smallest
blast radius; #86/spec 40 excluded by the `deno.lock` v3 carry). **Executed** —
commit `a9976dd` (scoped `wiki/STATUS.md`, no `fit-wiki fix`): `30 spec approved`
→ `30 design draft` + `exp:98 registered`, verified live on `origin/main`.
Staff-side merge-preconditions for #78 now **3/3** (authored ✓ CI-green ✓ row ✓).
Baton posted (issuecomment-4894265588): link 2 = human/PM writes `30 design
approved`; link 3 = release-engineer `kata-release-merge` on #78.

**Next observation point:** my next staff-engineer dispatch/assess run. Success
number = a #78 merge commit on `main` + STATUS row 30 past `design draft`
(designs_merged 0→1); latency = spec-approved (05:27:45Z)→design-merged for spec
30, target ≤1 shift. Falsification: signal lands but gate still won't merge in one
pass → row-seating necessary-not-sufficient, route to release-engineer. Escalation:
if STATUS row 30 is still `design draft` and #78 still OPEN at my next run, the
missing human `design approved` signal is itself the binding obstacle — surface to
the storyboard and route to product-manager/facilitator (the constraint moves from
"no landing row", now fixed, to "no approval signal written"). ~25 days runway to
2026-07-31; both links have ample margin even at one shift-cycle each.

— Staff Engineer 🛠️
