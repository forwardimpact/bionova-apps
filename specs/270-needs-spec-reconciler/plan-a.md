> **⚠️ PRE-FLIGHT — blocked on `design approved` (and, upstream, `spec approved`), DO NOT MERGE.**
> Staged under experiment [#283](https://github.com/forwardimpact/bionova-apps/issues/283)
> against the pre-flighted [`design-a.md`](./design-a.md) on this branch. Carries
> **no** ledger write, **no** PR, and must not land until a trusted human writes
> `spec approved` then `design approved` for spec 270. This is the plan leg of
> the [#168](https://github.com/forwardimpact/bionova-apps/issues/168)/[#233](https://github.com/forwardimpact/bionova-apps/issues/233)
> latency-collapse technique applied to a live, fully-owned in-tree spec.
>
> **⚠️ SPECULATIVE LEG — design is pre-flighted, not approved.** Spec 270's row
> sits at `spec draft` (PR [#277](https://github.com/forwardimpact/bionova-apps/issues/277)),
> so neither `spec approved` nor `design approved` exists. `design-a.md` was
> banked draft-only (exp #168 discipline), never gate-approved. **This staged
> plan implies no approval.** If the gate review redirects the spec or design,
> discard this plan and re-author — the cost is one thrown-away draft.

# Plan 270 — `needs-spec` reconciler

## Approach

Ship one pure Node classifier (`scripts/needs-spec-reconciler.js`) plus its
fixture-driven test (`scripts/needs-spec-reconciler.test.js`) and one scheduled
workflow (`.github/workflows/reconcile-needs-spec.yml`). The module is
side-effect-free — it builds a link index from in-tree `spec.md` bodies and
returns one retain-vs-reconcile decision per candidate issue. The workflow is
the only privileged surface: it lists open `needs-spec` issues, calls the pure
classifier, and for a positive verdict removes `needs-spec` and adds `triaged`
via first-party `actions/github-script`. WHAT/WHY in [`spec.md`](./spec.md);
WHICH/WHERE in [`design-a.md`](./design-a.md). This plan is HOW/WHEN only — it
adds no decision the design did not already make.

The module is modelled on `scripts/spec-design-watcher.js` (pure fns +
`gitSource`/`fsSource` injection seam) and `scripts/audit-gate.js` (CLI shape,
deterministic sorted output). The workflow is modelled on
`.github/workflows/monitor-spec-design.yml` (schedule + `workflow_dispatch`,
killswitch, App-token, `concurrency`) with the issue-mutating identity of
`.github/workflows/agent-dispatch.yml`.

## Load-bearing invariants (carried verbatim from spec + design; do not relax)

These are the non-negotiables the implementer must not drift on. Each maps to a
success criterion and a test.

- **Linkage = merged `spec.md` on `main`, by anchored body reference — NEVER
  issue-number match.** `#NN` is never equated to spec `NN` (#60 ≠ spec 60).
  The index is built off the checked-out tree on `main`, so it never reads any
  PR body — open OR merged (SC 3, 10, 11).
- **Fail-safe = RETAIN on ambiguity.** No index entry, a soft mention
  (`likely composing`, bare `#N`, incidental `#N / #M`), a forged/PR-only
  reference, or any parse error → RETAIN, labels untouched. A false drop
  silently loses spec work and is strictly worse than a duplicate (SC 4, 10).
- **Open/draft spec PR is NOT linkage.** A spec exists only when its `spec.md`
  is present in the in-tree `main` root. Draft-linked issues (#103/#127/#130,
  whose specs 110/130/150 are open PRs #122/#144/#171) get no positive link →
  RETAIN → `needs-spec` persists until the spec merges. No abandoned-draft
  restore leg exists, because merged-only never clears a draft (SC 4b, 16).
- **Deferred-no-spec issues pass untouched.** #60 (deferred, no spec) retains
  its labels unchanged (SC 5).
- **Remove `needs-spec` AND set `triaged` in one deterministic, idempotent
  pass.** A re-run on a reconciled issue is a no-op — it no longer carries
  `needs-spec`, so it is out of the candidate set (SC 2, 6).
- **Least privilege, default-deny.** `contents: read` + `issues: write`, nothing
  more. `issues: write`-only breaks `actions/checkout`'s tree read (SC 8, 11).
  No `pull-requests: read` — evidence is the tree, not PR bodies.
- **Untrusted text is inert data.** No `${{ github.event.* }}` interpolated into
  any `run:`/inline script; issue title/body/labels reach the classifier only
  via `env:`/octokit objects. Matcher is strict-anchored (SC 12).
- **Trigger is base-context only.** `schedule` + `workflow_dispatch`; never
  `pull_request_target`/`workflow_run` (SC 14).
- **Pinned supply chain.** Every `uses:` is a full 40-char commit SHA covered by
  the `github-actions` Dependabot ecosystem; no third-party action gets
  `GITHUB_TOKEN` (SC 13).
- **Audit every decision.** One log line per processed issue — issue, resolved
  link, retain-vs-mutate outcome (SC 15).

## Preconditions

- **P1 — #129 citation seed.** #129 is served-but-uncited: spec 210 and spec 60
  serve its Referring-Physician JTBD job but name no issue number (verified on
  `main`: neither `spec.md` carries a `#129` reference). Before the reconciler
  can cover #129 (SC 9), a `Serves issue #129.` line must land in an
  **already-merged** spec on `main` — spec 210 (`specs/210-physician-bookmark/spec.md`)
  is the natural home (it is the delivering spec for the bookmark job). This is a
  small provenance-safe doc PR through the normal gate, NOT part of the
  reconciler diff, and NOT a `story.dsl` edit. Until it lands, #129 correctly
  RETAINs — the reconciler is not wrong, it is waiting for evidence. **This
  precondition is a separate PR and does not block the reconciler shipping;** it
  only gates the #129 line of SC 9.
- **P2 — `triaged` label exists.** Already provisioned this session
  (release-engineer created + backfilled onto #128/#129). No action.
- **P3 — Dependabot `github-actions` ecosystem is enabled.** Confirm
  `.github/dependabot.yml` covers `github-actions` so the new workflow's SHA
  pins stay maintained (SC 13). If absent, add the ecosystem stanza in the
  workflow PR.

## Steps

### Step 1 — `scripts/needs-spec-reconciler.js` (pure classifier + link index)

Author the module with these exports (design "Interfaces"):

- `parsePositiveLinks(specBody) → issueNumber[]` — the anchored grammar. Match,
  case-insensitive and anchored to a line/sentence boundary:
  `Serves issue #N`, `Serves #N`, `Issue: #N`, `**Issue:** [#N]`,
  `Closes/Resolves/Fixes #N`. A bare `#N`, `likely composing #N`, `may compose
  #N`, or an incidental `#N / #M` list does NOT match. Return the parsed issue
  numbers. This is the single spoofable-substring guard (SC 12).
- `buildLinkIndex(specSource) → Map<issueNumber, specId[]>` — enumerate
  `specs/*/spec.md` via the source, run `parsePositiveLinks` over each body,
  invert to `issue# → [specId]`. Only anchored positives populate it.
- `classify(issue, linkIndex) → {issue, link, action: "reconcile"|"retain",
  reason}` — `reconcile` iff `linkIndex` has a non-empty entry for the issue
  number AND the issue still carries `needs-spec`; else `retain` with a reason
  string (`no-link`, `soft-mention`, `already-clear`, `parse-error`). Pure; no
  network, no label writes.
- `gitSource(ref) / fsSource(root) → specSource` — reuse
  `spec-design-watcher.js`'s `git ls-tree`/`git show` shape for `gitSource` and
  the `readdirSync`/`readFileSync` shape for `fsSource`. `specSource` is the
  ONLY injection seam. **Copy the pattern; do not import** — the watcher's
  sources also read `STATUS.md`, which this module does not need (keep the
  reconciler's source minimal: `specIds` + `readSpec(id)`).

CLI (design "Interfaces"): `node scripts/needs-spec-reconciler.js [--json]
[--ref=origin/main] [--root=<dir>]`. `--json` emits the decision array; `--root`
reads a fixture tree; default reads `spec.md` bodies from `--ref` (default
`origin/main`). **No `--record`** — this gate ships no metric. Guard `main()`
behind the `import.meta.url === file://${process.argv[1]}` idiom, matching the
watcher.

*Note — candidate-issue list.* `classify` takes an `issue` object
(`{number, labels}`); the CLI has no issue list of its own (no API), so in
`--json`/CLI mode it prints the link index and per-spec parse results for
inspection. The live candidate list is supplied by the workflow (Step 3). This
keeps the module pure and the CLI useful for dry-run linkage inspection without
a token.

### Step 2 — `scripts/needs-spec-reconciler.test.js` (fixture-driven unit tests)

`bun:test`, modelled on `spec-design-watcher.test.js` and `audit-gate.test.js`.
Drive `buildLinkIndex`/`classify` off `fsSource` fixture trees — no git, no
token. Cover every classifier-observable SC:

- SC 2 — positive link (fixture spec with `Serves issue #NNN`) + issue carrying
  `needs-spec` → `reconcile`.
- SC 3 — number-collision: an issue whose number matches a spec dir number but
  is not referenced in that spec's body → `retain`.
- SC 4a — soft `likely composing #N` mention → `retain`.
- SC 4b / SC 16 — **paired open/merged fixture over one synthetic issue #9xx**
  against two `fsSource` trees on the same run: (a) linking `spec.md` ABSENT →
  `retain`; (b) same `spec.md` PRESENT with a `Serves issue #9xx` line →
  `reconcile`. This one pair is the merged-vs-open hinge (design test-coverage
  row; SC 16).
- SC 5 — deferred-no-spec issue (models #60) → `retain`.
- SC 6 — idempotence: an issue already lacking `needs-spec` → `retain`
  (`already-clear`), never a second mutation.
- SC 9 — known case: a fixture modelling spec 140's `Serves issue #128.` →
  `reconcile` for #128; a #129 fixture with no citation → `retain` until the P1
  seed lands.
- SC 10 — forged-reference: a spec-reference present only in a simulated PR body
  (i.e. NOT in the `fsSource` tree) → never indexed → `retain`.
- SC 12 — strict-anchor: a spoofable substring (`needs-spec... see #N somewhere`)
  → not matched → `retain`.

Add the fixture tree under `scripts/fixtures/needs-spec-reconciler/` (mirror
`scripts/fixtures/specs-awaiting-design/`): a few `specs/<id>/spec.md` bodies
exercising positive, soft, number-collision, and forged cases, plus the paired
absent/present pair for SC 16.

### Step 3 — `.github/workflows/reconcile-needs-spec.yml` (the only privileged surface)

Model: `monitor-spec-design.yml` (structure) + `agent-dispatch.yml` (App-token
issue-mutation). Concretely:

- `on: { schedule: [{cron: "0 4 * * *"}], workflow_dispatch: {} }` — 04:00 UTC,
  BEFORE the 05:00 monitor and 06:00 storyboard, so the day's P2 survey reads a
  reconciled label set (SC 7 ordering). NO `pull_request_target`/`workflow_run`
  (SC 14).
- `concurrency: { group: reconcile-needs-spec, cancel-in-progress: false }` —
  single recorder; a mid-run trigger must not cancel a label write.
- `permissions: { contents: read, issues: write }` — default-deny; exactly two
  scopes (SC 8, 11). No `pull-requests`.
- First step: the house `KATA_KILLSWITCH` guard (copy verbatim from
  `monitor-spec-design.yml`).
- `env: { APM_RESOLVE_PARALLEL: "1" }` at job level ONLY IF the job runs the
  bootstrap/apm resolve. **This job needs no `bootstrap`/CLI install** — it runs
  no harness and no `gemba-*`; it only checks out the tree and runs
  `github-script`. So OMIT the bootstrap step and the apm guard (MEMORY apm-race
  row applies only to jobs that resolve apm). Confirm during implementation that
  no step shells out to a bootstrap-installed CLI.
- `actions/create-github-app-token` (SHA-pinned, matching the repo's current
  pin `bcd2ba4…` v3.2.0) → Kata App identity, so triage edits attribute to the
  kata bot, consistent with `monitor-spec-design.yml`/`agent-dispatch.yml`
  (design Key Decision "Token identity").
- `actions/checkout` (SHA-pinned `3d3c42e…` v7.0.1). `fetch-depth: 1` is enough
  — the reconciler reads current `spec.md` bodies, not merge dates (contrast the
  watcher, which needs `fetch-depth: 0` for `git log`). Verify at implementation.
- ONE `actions/github-script` step (SHA-pinned) that does ALL privileged I/O:
  1. `octokit.paginate` list issues `state:open, labels:needs-spec`.
  2. `require("../../scripts/needs-spec-reconciler.js")` →
     `buildLinkIndex(gitSource("HEAD"))`, then `classify` per issue.
  3. For a `reconcile` verdict: `removeLabel(needs-spec)` + `addLabels([triaged])`.
  4. `console.log` one audit line per issue: number, resolved link, outcome
     (SC 15).
  No decision lives in the step — every branch is the unit-tested classifier's.
  Issue title/body reach the classifier via octokit objects, never interpolated
  into a `run:` (SC 12).
- If `.github/dependabot.yml` does not already cover `github-actions`, add the
  ecosystem stanza in this PR (P3 / SC 13).

### Step 4 — Retire the manual strip (documentation only)

The reconciler REPLACES the storyboard-shift `needs-spec` strip (SC 7). That
strip is a coach convention, not tracked code, so this plan cannot delete it in
a diff. Action: note in the PR body that the coach retires the convention once
the gate is live, and (if the convention is written anywhere in `wiki/` or a
skill reference) leave a one-line pointer for the coach — do NOT edit coach-owned
files unilaterally. Two writers on one label collapse to one.

### Step 5 — Quality gates

`just lint` / `just test` (the new `bun:test` file runs under the repo suite) /
`just smoke` as applicable. The reconciler is not read by
`scripts/spec-design-watcher.js`, so it does not perturb the design-artifact
gauge. Add no new required CI check beyond the workflow itself.

## Sequencing

1. Step 1 (module) → Step 2 (tests) together — TDD; tests are the acceptance
   surface for SC 2–6, 9, 10, 12, 16.
2. Step 3 (workflow) — depends on the module's exports being stable.
3. P1 (#129 seed) — independent doc PR, any time; only gates the #129 half of
   SC 9. Ship the reconciler without waiting on it.
4. Step 4 (strip retirement) — coach-coordinated, after the gate is live.

All of Steps 1–3 land in ONE PR (the reconciler is one artifact: module + test +
workflow). P1 is a separate PR.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Anchored grammar too loose → forges a link from a soft mention (false DROP, the unrecoverable failure) | Strict anchoring + the SC 12 spoof test + the SC 10 forged-ref test. Every not-proven path is RETAIN. A grammar change requires a new failing test first. |
| Anchored grammar too tight → misses a real citation (false RETAIN) | Strictly the safe-side failure: a missed clear leaves a duplicate for triage, never loses spec work. Acceptable per the fail-safe. The SC 9 #128 case pins the known-good phrase. |
| Workflow self-retriggers on its own label write | Trigger is `schedule`/`workflow_dispatch` only — no `issues` typed event, so no self-trigger. `concurrency` group is the backstop if an `issues` trigger is ever added (spec constraint). |
| `github-script` `require` path wrong at runtime | Resolve relative to `github.workspace`; a smoke `workflow_dispatch` run on a throwaway label set verifies the wiring before trusting the schedule. |
| PR-body evidence leaks in via a future refactor | `gitSource` reads `git show HEAD:specs/*/spec.md` — the checked-out tree only. There is no PR-API call and no `pull-requests` scope, so the leak path does not exist by construction (design "Evidence source"). |
| #129 seed never lands | #129 RETAINs indefinitely — correct behaviour, not a bug. P1 is tracked but non-blocking. |

## Success-criteria → step map

SC 1 → Steps 1+3 (files exist, no profile touched). SC 2,3,4,5,6,9,10,12,16 →
Step 2 (unit tests). SC 7 → Step 3 (cron ordering) + Step 4 (strip retirement).
SC 8,11,13,14 → Step 3 (workflow header). SC 15 → Step 3 (`github-script` log).

## Pre-flight panel result (exp #283 — prediction FAILED, honestly)

Three independent reviewers (invariant-fidelity, security/supply-chain,
executability) graded this draft. Aggregate: **1 blocker, 6 highs** — so exp
#283's pre-registered gate (panel returns 0 blockers / 0 highs) is NOT met and
the prediction is **falsified**. The plan leg **resisted** pre-flight. This is
the recorded finding.

**The resisting leg — a latent DESIGN defect, not merely a plan gap.** Two
reviewers independently hit the same runtime break: the repo is
`"type": "module"`, so the reconciler is ESM, but `actions/github-script`
executes its inline body as CommonJS and its `require()` throws `ERR_REQUIRE_ESM`
on an ESM module. The design's Interfaces/data-flow already prescribe
`require`-ing the module from `github-script`, so this is seeded upstream in
`design-a.md` — the plan pre-flight surfaced a defect the 07-25 design panel
(0/0) missed. **Fix belongs at design:** load via `await import(...)` inside
`github-script`, or invoke the classifier as a `run: node … --json` step and
feed a thin `github-script` consumer. There is zero in-repo `actions/github-script`
precedent to copy, which is why the wiring was under-specified.

**Invariant-touching findings (for the spec-270 design-input):**

- **(a) linkage-by-body-reference.** `parsePositiveLinks` is under-specified at
  the exact boundary that decides false-drops: word-boundary on `#N` (`#128` vs
  `#1289`), matching through `**Issue:** [#126](url)` and stopping at `]`,
  trailing-period tolerance (`Serves issue #128.`), and the negative `#27 / #22`
  footnote. The design's `Closes/Resolves/Fixes #N` alt is the widest and most
  spoofable anchor — it enlarges the false-DROP surface invariant (b) guards and
  should be flagged for the approver (as the design flagged its `spec approved`
  bypass). Needs a concrete regex + a must/must-not-match literal corpus pinned
  by the SC 12 test.
- **(b) fail-safe RETAIN.** The `parse-error → RETAIN` path — named in both spec
  and design as the fail-safe — has NO test. A malformed/unreadable `spec.md`
  must RETAIN the affected issue AND not poison the index for others. Add the
  fixture.
- **(c) merged-only / open-PR-is-not-linkage.** The SC 4b/16 absent-spec RETAIN
  must assert `reason === "no-link"` explicitly, not just `action === "retain"`.
  Pinning the reason-code is what stops a future refactor from mis-routing an
  absent-spec issue through a wrong-but-still-RETAIN branch that later gets
  "optimized" into a drop — the exact false-drop invariant (c) exists to prevent.
- **(e) remove `needs-spec` + set `triaged`, idempotent.** The octokit mutation,
  idempotence, and audit-log surface (SC 2/6/15's observable half) lives entirely
  in the untested `github-script` step and has no in-repo precedent
  (`agent-dispatch.yml` mutates via the harness, not `octokit.removeLabel`).
  Make the reconcile→(remove,add) mapping and the audit-line formatter pure,
  unit-tested module functions; leave `github-script` a thin caller. Specify the
  exact octokit calls and how a missing-label 404 is swallowed to keep
  idempotence.

**Least-privilege caveat (SC 8/11).** The design claims the App token "runs under
the default-deny scopes." An `actions/create-github-app-token` token carries the
App installation's permissions unless minted with `permission-contents: read` /
`permission-issues: write` inputs; the job `permissions:` block bounds the
default `GITHUB_TOKEN`, not the App token. Either scope the token at mint time or
document that the Kata App installation is itself limited. Also: pin
`actions/github-script` to a concrete 40-char SHA (no in-repo pin to inherit).

**Next step:** the design absorbs the `import()`/wiring fix and the four
invariant sharpenings, then this plan is re-drafted and re-panelled. Not banked;
not pushed as ready. `plan_preflighted` is NOT recorded (gate unmet).

— Staff Engineer 🛠️
