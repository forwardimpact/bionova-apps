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

Ship one pure Node module (`scripts/needs-spec-reconciler.js`) plus its
fixture-driven test (`scripts/needs-spec-reconciler.test.js`) and one scheduled
workflow (`.github/workflows/reconcile-needs-spec.yml`). The module is
side-effect-free — it builds a link index from in-tree `spec.md` bodies and
returns one `{issue, link, action, reason}` decision per candidate issue, plus
the pure decision→label-ops and audit-line functions. The workflow is the only
privileged surface and splits at the trust boundary into three steps: a
token-scoped `list` that emits `candidates.json`, a **token-free** `node`
`compute` that does all `spec.md` parsing and emits `decisions.json`, and a thin
`github-script` `apply` that re-validates each decision and writes labels. WHAT/WHY
in [`spec.md`](./spec.md); WHICH/WHERE in [`design-a.md`](./design-a.md). This
plan is HOW/WHEN only — it adds no decision the design did not already make.

The module is modelled on `scripts/spec-design-watcher.js` (pure fns +
`gitSource`/`fsSource` injection seam) and `scripts/audit-gate.js` (CLI shape,
`bun:test` fixtures). The workflow is modelled on
`.github/workflows/monitor-spec-design.yml` (schedule + `workflow_dispatch`,
killswitch, `concurrency`, SHA-pinned actions) with the App-token identity of
`.github/workflows/agent-dispatch.yml` — but **mint-scoped** (design "Token
identity" + sign-off §1).

`Libraries used: none.` (Node built-ins `node:child_process`, `node:fs`,
`node:path`; `bun:test`; first-party `actions/*` only.)

## Load-bearing invariants (carried verbatim from spec + design; do not relax)

Each maps to a success criterion and a test.

- **Linkage = merged `spec.md` on `main`, by anchored body reference — NEVER
  issue-number match.** `#NN` is never equated to spec `NN` (#60 ≠ spec 60). The
  index is built off the checked-out `HEAD` tree on `main`, so it never reads any
  PR body — open OR merged (SC 3, 10, 11).
- **Fail-safe = RETAIN on ambiguity.** No index entry, a soft mention, a
  forged/PR-only reference, an unvalidated decision, or any parse error → RETAIN,
  labels untouched. A false drop silently loses spec work and is strictly worse
  than a duplicate (SC 4, 10).
- **Open/draft spec PR is NOT linkage.** A spec exists only when its `spec.md` is
  present in the in-tree `main` root. Draft-linked issues (#103/#127/#130, specs
  110/130/150 on open PRs #122/#144/#171) get no positive link → RETAIN →
  `needs-spec` persists until the spec merges. No abandoned-draft restore leg
  exists, because merged-only never clears a draft (SC 4b, 16).
- **Deferred-no-spec issues pass untouched.** #60 (deferred, no spec) retains its
  labels unchanged (SC 5).
- **Add `triaged` THEN remove `needs-spec`, idempotent.** Add-before-remove: a
  partial-write failure leaves the issue still `needs-spec` (RETAIN-equivalent),
  never bare (SC 2, 6). A re-run on a reconciled issue is a no-op — it no longer
  carries `needs-spec`, so it is out of the candidate query.
- **Compute is token-free; only `apply` holds `issues: write`.** The `spec.md`
  parse — the highest-risk code — runs in a `node` subprocess with no
  `GITHUB_TOKEN` in env. The `github-script` consumer parses no `spec.md` (design
  "Compute / effect split" + sign-off §3).
- **Least privilege is a two-leg anti-bypass split, each leg independently
  fixtured — do not collapse to just the block.** (a) NECESSARY: the job
  `permissions:` block declares exactly `contents: read` + `issues: write`, no
  `write-all` (SC 11 declared-block leg). (b) SUFFICIENT: the token that actually
  performs the writes — the minted App token — is scoped AT MINT to exactly those
  two `permission-*` inputs and no more, because the block bounds only the unused
  default `GITHUB_TOKEN`, never a minted token (SC 8 effective-scope tooth + SC 11
  minted-scope leg). Neither leg is deferred to the other; a spotless block
  shipping alongside an over-scoped minted token still FAILS (SC 8). Each leg gets
  its own Step-2 fixture — a good workflow plus a leg-specific over-scoped negative
  (design "Token identity" + sign-off §1).
- **Untrusted text is inert data.** No `${{ github.event.* }}` interpolated into
  any `run:`/inline script; the candidate list and decisions reach each step as a
  JSON **file**, never argv; issue title/body reach the classifier only via those
  files. Matcher is strict-anchored (SC 12).
- **Trigger is base-context only.** `schedule` + `workflow_dispatch`; never
  `pull_request_target`/`workflow_run`/`issues` (SC 14).
- **Pinned supply chain.** Every `uses:` is a full 40-char commit SHA covered by
  the `github-actions` Dependabot ecosystem; no third-party action gets a token
  (SC 13).
- **Audit every decision.** One log line per processed issue — issue, resolved
  link, retain-vs-mutate outcome (SC 15).

## Preconditions

- **P1 — #129 citation seed.** #129 is served-but-uncited: spec 210 and spec 60
  serve its Referring-Physician JTBD job but name no issue number (verified on
  `main`: neither `spec.md` carries a `#129` reference). Before the reconciler can
  reconcile #129 (SC 9), a `Serves issue #129.` line must land in an
  **already-merged** spec on `main` — spec 210
  (`specs/210-physician-bookmark/spec.md`) is the natural home (the delivering
  spec for the bookmark job). A small provenance-safe doc PR through the normal
  gate, NOT part of the reconciler diff, NOT a `story.dsl` edit. Until it lands
  #129 correctly RETAINs — the reconciler is not wrong, it is waiting for
  evidence. **Separate PR; does not block the reconciler shipping** — it only
  gates the #129 line of SC 9.
- **P2 — `triaged` label exists.** Already provisioned this session
  (release-engineer created + backfilled onto #128/#129). No action.
- **P3 — Dependabot `github-actions` ecosystem is enabled.** **Already satisfied
  and verified** — `.github/dependabot.yml` carries a `github-actions` ecosystem
  at directory `/`, so the new workflow's SHA pins are tracked with no
  config change (SC 13). No action.

## Steps

### Step 1 — `scripts/needs-spec-reconciler.js` (pure classifier + link index)

Author the ESM module with the design's "Module exports":

- `parsePositiveLinks(specBody) → issueNumber[]` — the anchored grammar (design
  "Linkage grammar"). Case-insensitive, anchored, matching **only**:
  `Serves issue #N`, `Serves #N`, line-leading `**Issue:** [#N]` (through the
  markdown link, stopping at `]`), `Closes/Resolves/Fixes #N`. It must NOT match
  a bare `#N`, `likely composing #N`, `may compose #N`, an incidental `#N / #M`
  list, a reference inside a fenced/inline code span, or mid-prose `Issue: #N`.
  `#N` is a whole-number token — `#128` matches, `#1289`/`#1128`/`##128` do not;
  a trailing `.`/`,`/`)`/EOL is tolerated. This is the single spoofable-substring
  guard (SC 12). Pin it with a concrete regex plus the must/must-not-match literal
  corpus in Step 2.
- `buildLinkIndex(specSource) → {index: Map<issueNumber, specId[]>, parseErrors: specId[]}` —
  enumerate the source's spec ids, read each `spec.md` body, run
  `parsePositiveLinks`, invert to `issue# → [specId]` in `index`. Only anchored
  positives populate `index`. A body that throws in the read/parse is caught
  **per-`spec.md`**; its spec id is appended to `parseErrors` and it contributes
  no links, so it can only ever leave issues RETAINed, never drop one, and never
  poisons the index for other specs. `parseErrors` is a spec-level diagnostic, not
  an issue reason (design "Fail-safe").
- `classify(issue, index) → {issue, link, action: "reconcile"|"retain", reason}` —
  reads `issue.number` (index lookup) and `issue.labels` (the `already-clear`
  gate). `reconcile` iff `index` has a non-empty entry for `issue.number` AND
  `issue.labels` still includes `needs-spec`; else `retain` with `reason ∈
  {no-link, already-clear}` — `already-clear` when the issue no longer carries
  `needs-spec`, else `no-link` (covers absent-spec/open-PR-only [SC 4b/16], a
  soft/ambiguous mention [SC 4a], and a forged/PR-only reference [SC 10]). Both
  reasons derive from `(issue, index)` alone. `link` is a display string built from
  the index entry: each hit's **numeric spec id** (the leading digits of the
  `specId` dir slug — `140-cross-trial-interest-overview` → `140`) rendered
  `spec 140`, multiple hits joined with `, `; `null` on a retain. Pure; no network,
  no label writes.
- `labelOps(decision) → {add: string[], remove: string[]}` — pure decision→ops
  map: `{add:["triaged"], remove:["needs-spec"]}` on `reconcile`, `{add:[],
  remove:[]}` otherwise. Emitted into each decision so the `apply` consumer names
  no label from a raw string (SC 2).
- `auditLine(decision) → string` — pure one-line audit record, exact format
  `#<issue> → <link|—> <action>[(<reason>)]`, where `<action>` is bare on
  `reconcile` and carries `(<reason>)` on `retain` — e.g. `#128 → spec 140 reconcile`,
  `#60 → — retain(no-link)`. The Step 2 test asserts these literals (SC 15).
- `declaredBlockOk(permissions) → boolean` and `mintScopeOk(mintInputs) → boolean`
  — the two independent least-privilege predicates (SC 11 / SC 8), pure and
  object-in so each is fixturable on its own. `declaredBlockOk` is true iff the
  parsed job `permissions` map is EXACTLY `{contents:"read", issues:"write"}` —
  no extra key, no `write-all`, no wider scope (SC 11 necessary leg).
  `mintScopeOk` is true iff the minted-token step's `permission-*` inputs are
  EXACTLY `{"permission-contents":"read","permission-issues":"write"}` — any
  additional `permission-*` key fails (SC 8 effective-scope tooth + SC 11
  minted-scope leg). They are independent by construction: neither reads the
  other's input, so a good block with an over-scoped mint passes `declaredBlockOk`
  and fails `mintScopeOk`. The workflow-header test (Step 2) extracts both maps
  from the real `reconcile-needs-spec.yml` text with anchored line regexes — **no
  YAML dependency is added** (dependency-free, matching the repo's text-check
  style; SC 13 spirit) — and feeds them to these predicates, so the same rule that
  the fixtures pin also guards the shipped file.
- `gitSource(ref) / fsSource(root) → specSource` — reuse the watcher's shapes.
  **Copy the pattern; do not import** — the watcher's sources also read
  `STATUS.md`, which this module does not need. Keep the source minimal:
  `specIds` + `readSpec(id) → string`. `gitSource` adds a body read the watcher
  lacks: `git show ${ref}:specs/<id>/spec.md`, wrapped per-file so a read failure
  is reported by `buildLinkIndex` in `parseErrors` rather than aborting the run.
  `fsSource` reads the body with `readFileSync`. `specSource` is the ONLY
  injection seam. **`specIds` enumerates spec dirs by directory presence — NOT
  gated on `spec.md` existence** (unlike the watcher, which filters to dirs that
  carry `spec.md`): the reconciler WANTS a spec dir whose `spec.md` is
  missing/unreadable to surface as a `parseErrors` entry, so `readSpec` throwing
  (ENOENT / `git show` failure) is the caught signal. This also makes the
  malformed-spec fixture portable and git-committable (Step 2).

CLI (design "Interfaces" — the token-free compute step):
`node scripts/needs-spec-reconciler.js --candidates=<file> --json [--ref=origin/main] [--root=<dir>]`.
Reads the candidate list (`[{number, labels:string[]}]`) from the `--candidates`
JSON **file** (never argv — argument-injection guard, sign-off §3(iii)), builds
the index from `spec.md` on `--ref` (default `origin/main` for a human dry-run;
the workflow passes `--ref=HEAD` — see Step 3.5) or a `--root` fixture, and emits
`{decisions, parseErrors}` to stdout — `decisions` an array (each carrying `link`,
`action`, `reason`, and `ops` from `labelOps`), `parseErrors` the spec-level
diagnostic so `apply` can log it (never silent — design "Fail-safe"). Without
`--candidates`, `--json` emits the `{index, parseErrors}` object alone (dry-run
linkage inspection). **No `--record`** — this gate ships no metric. Guard `main()` behind the
`import.meta.url === file://${process.argv[1]}` idiom, matching the watcher.

### Step 2 — `scripts/needs-spec-reconciler.test.js` (fixture-driven unit tests)

`bun:test`, modelled on `spec-design-watcher.test.js` and `audit-gate.test.js`
(`import { test, expect } from "bun:test"`; resolve the module via
`new URL("./needs-spec-reconciler.js", import.meta.url).pathname`). Drive
`buildLinkIndex`/`classify`/`labelOps`/`auditLine` off `fsSource` fixture trees —
no git, no token. Every classifier-observable SC gets a case, and every named
`reason` code is asserted explicitly (not just `action`), so a future refactor
cannot reroute a RETAIN into a drop:

- **SC 2** — positive link (`Serves issue #NNN`) + issue carrying `needs-spec` →
  `action:"reconcile"`; assert `labelOps` = `{add:["triaged"], remove:["needs-spec"]}`.
- **SC 3** — number-collision: issue number matches a spec dir number but is not
  referenced in that spec's body → `retain`, `reason:"no-link"`.
- **SC 4a** — soft `likely composing #N` mention → `retain`, **assert
  `reason === "no-link"`** (a soft mention carries no anchored positive link).
- **SC 4b / SC 16** — **paired open/merged fixture over one synthetic issue #9xx**
  against two `fsSource` trees on the same run: (a) linking `spec.md` ABSENT →
  `retain`, **assert `reason === "no-link"`**; (b) same `spec.md` PRESENT with a
  `Serves issue #9xx` line → `reconcile`. The merged-vs-open hinge.
- **SC 5** — deferred-no-spec issue (models #60) → `retain`, **`reason:"no-link"`**,
  labels untouched.
- **SC 6** — idempotence: issue already lacking `needs-spec` → `retain`,
  `reason:"already-clear"`; `labelOps` empties (never a second mutation).
- **SC 9** — known case: a fixture modelling spec 140's `Serves issue #128.` →
  `reconcile` for #128; a #129 fixture with no citation → `retain`,
  `reason:"no-link"`, until the P1 seed lands.
- **SC 10** — forged-reference: a spec-reference present only in a simulated PR
  body (i.e. NOT in the `fsSource` tree) → never indexed → `retain`,
  `reason:"no-link"`.
- **SC 12** — strict-anchor must/must-not-match literal corpus:
  **must-match** `Serves issue #128.`, `**Issue:** [#126](url)`;
  **must-not-match** `#27 / #22`, bare `#128`, `likely composing #130`,
  `` `Fixes #9` `` in a code span, mid-prose `Issue: #128`, `#1289` (boundary).
- **malformed-spec fail-safe** — the `parseErrors` path triggers on a `readSpec`
  THROW (a regex cannot throw), so the portable fixture is a spec dir enumerated
  by directory presence but with **no readable `spec.md`** (a committed dir with a
  `.gitkeep` and no `spec.md`), beside a sibling spec carrying a positive link.
  **Assert** every candidate issue RETAINs, the missing spec's id appears in
  `buildLinkIndex().parseErrors`, and the sibling's positive link still
  `reconcile`s (one bad spec cannot poison the index or drop an issue).
- **SC 11 declared-block leg (necessary), own fixture** — `declaredBlockOk`
  returns true for `{contents:"read", issues:"write"}` and false for each
  over-broad variant: an added `pull-requests:"write"` key, a `write-all`, and a
  bare `contents:"write"`. Also assert it true against the map extracted from the
  real `reconcile-needs-spec.yml`.
- **SC 8 / SC 11 minted-scope leg (sufficient), own fixture** — `mintScopeOk`
  returns true for `{"permission-contents":"read","permission-issues":"write"}`
  and false for an added `permission-pull-requests:"write"` and for a missing
  `permission-*`. **Independence tooth (SC 8):** the pair `{good block,
  over-scoped mint}` → `declaredBlockOk` true AND `mintScopeOk` false — a spotless
  block does NOT rescue an over-scoped minted token. Also assert `mintScopeOk`
  true against the mint inputs extracted from the real workflow.
- **`auditLine`** — assert the exact literal format from Step 1
  (`#128 → spec 140 reconcile`, `#60 → — retain(no-link)`) so Step 1 and the test
  agree on one string (SC 15).

Add the fixture tree under `scripts/fixtures/needs-spec-reconciler/` (mirror
`scripts/fixtures/specs-awaiting-design/`): `specs/<id>/spec.md` bodies exercising
positive, soft, number-collision, code-span, and forged cases, plus the paired
absent/present pair for SC 16 and a spec dir with a `.gitkeep` and no `spec.md`
for the malformed-spec fail-safe.

### Step 3 — `.github/workflows/reconcile-needs-spec.yml` (the only privileged surface)

Model: `monitor-spec-design.yml` (structure) + `agent-dispatch.yml` (App-token),
mint-scoped. A **3-step trust-split** (design "Data flow"). Concretely:

- `on: { schedule: [{cron: "0 4 * * *"}], workflow_dispatch: {} }` — 04:00 UTC,
  BEFORE the 05:00 monitor and 06:00 storyboard, so the daytime storyboard/P2 pass
  reads a reconciled label set (SC 7 documents the ordering; it is not a hard
  coupling). NO `pull_request_target`/`workflow_run`/`issues` (SC 14).
- `concurrency: { group: reconcile-needs-spec, cancel-in-progress: false }` —
  single writer; a mid-run trigger must not cancel a label write.
- `permissions: { contents: read, issues: write }` — default-deny; exactly two
  scopes (SC 8, 11). No `pull-requests`.
- **No job-level `env:` carrying the token.** The minted token is a step output
  passed only to the `with:`/`github-token:` of the checkout, list, and apply
  steps — it must NOT appear in any job-level `env:` block, so the token-free
  property of the compute step is structural, not merely asserted for one step.
- **No `bootstrap`/apm step.** This job runs no harness and no `gemba-*` CLI — it
  only checks out the tree, runs `node`, and calls `github-script`. So OMIT the
  bootstrap step and the `APM_RESOLVE_PARALLEL` guard (the MEMORY apm-race row
  applies only to jobs that resolve apm). Confirm during implementation that no
  step shells out to a bootstrap-installed CLI.
- **Step order:**
  1. `Kata killswitch` — copy the `${{ vars.KATA_KILLSWITCH }}` guard verbatim
     from `monitor-spec-design.yml`.
  2. `Generate token` — `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`
     with `app-id`/`private-key` from `KATA_APP_ID`/`KATA_APP_PRIVATE_KEY` **plus
     `permission-contents: read` and `permission-issues: write`** (mint-scoped;
     sign-off §1). The Kata App identity attributes triage edits to the kata bot,
     matching the house issue-mutating workflows.
  3. `Checkout` — `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`,
     `token: ${{ steps.<token>.outputs.token }}`. Default `fetch-depth` suffices —
     `gitSource` reads only the `HEAD` tree, no `git log` history (contrast the
     watcher's `fetch-depth: 0`). Verify at implementation.
  4. **list** — `actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1`
     (`github-token` = minted token): `octokit.paginate` list issues
     `state:open, labels:needs-spec`, keep **number + `labels[].name` only**,
     write `candidates.json` (`[{number, labels:string[]}]`). No `spec.md` read
     here.
  5. **compute** — `run: node scripts/needs-spec-reconciler.js --candidates=candidates.json --ref=HEAD --json > decisions.json`.
     **TOKEN-FREE** (no `GH_TOKEN`/`GITHUB_TOKEN` in this step's `env`): all
     `spec.md` parsing + `buildLinkIndex`/`classify`/`labelOps`/`auditLine` run
     here.
  6. **apply** — `actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1`
     (minted token, `issues: write`): `JSON.parse(decisions.json)` → `{decisions,
     parseErrors}`; **re-validate** each decision (`action ∈ {reconcile,retain}`,
     `issue` a positive int, `ops` labels ⊆ `{triaged, needs-spec}`; else skip =
     RETAIN); for `reconcile`, octokit `addLabels(["triaged"])` **THEN**
     `removeLabel("needs-spec")` (swallow the 404 on an already-missing label to
     hold idempotence); `console.log` the `auditLine` for every issue, and one
     `spec <id> → parse-error` line per `parseErrors` entry so a malformed `spec.md`
     is never silent (SC 15; design "Fail-safe"). The consumer parses no `spec.md`
     and names labels only from the validated `ops` (SC 12).

Every `uses:` is a 40-char SHA under the `github-actions` Dependabot ecosystem
(P3 / SC 13). **Verify the `actions/github-script` v7.0.1 SHA
`60a0d83039c74a4aee543508d2ffcb1c3799cdea` against the upstream release tag at
implementation** — there is no in-repo `github-script` pin to inherit.

### Step 4 — Retire the manual strip (documentation only)

The reconciler SUPERSEDES the storyboard-shift `needs-spec` strip (SC 7). That
strip is a coach convention, not tracked code, so this plan cannot delete it in a
diff. Action: note in the PR body that the coach retires the convention once the
gate is live, and (if the convention is written anywhere in `wiki/` or a skill
reference) leave a one-line pointer for the coach — do NOT edit coach-owned files
unilaterally. Two writers on one label collapse to one.

### Step 5 — Quality gates

`just lint` / `just test` (the new `bun:test` file runs under the repo suite) /
`just smoke` as applicable. The reconciler is not read by
`scripts/spec-design-watcher.js`, so it does not perturb the design-artifact
gauge. Add no new required CI check beyond the workflow itself. Before trusting
the schedule, run one `workflow_dispatch` smoke on a throwaway label set to verify
the `list → compute → apply` wiring and the `require`-free (ESM-safe) execution.

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
| Anchored grammar too loose → forges a link from a soft mention (false DROP, the unrecoverable failure) | Strict anchoring + the SC 12 spoof/code-span corpus + the SC 10 forged-ref test. Every not-proven path is RETAIN. A grammar change requires a new failing test first. |
| Anchored grammar too tight → misses a real citation (false RETAIN) | Strictly the safe-side failure: a missed clear leaves a duplicate for triage, never loses spec work. The SC 9 #128 case pins the known-good phrase. |
| `actions/github-script` runs CommonJS; the module is ESM (`"type":"module"`) | Structural: the parse runs in the token-free `node` subprocess (Step 3.5), NOT inside `github-script`. The consumer `JSON.parse`s a data file and `require`s nothing. This is the design fix the earlier pre-flight forced. |
| A minted App token carries the installation's full (broader) permissions | Mint-scoped with `permission-contents: read` + `permission-issues: write` (Step 3.2); the job `permissions:` block is defense-in-depth only (sign-off §1). |
| Workflow self-retriggers on its own label write | Trigger is `schedule`/`workflow_dispatch` only — no `issues` typed event, so no self-trigger. `concurrency` group is the backstop. |
| A malformed decision or `spec.md` slips a false drop through | `compute` catches parse errors per-file (bad spec id → `parseErrors`, zero links contributed → RETAIN); `apply` re-validates every decision and skips (RETAIN) any it cannot prove — a false drop needs BOTH layers to fail. |
| `github-script` `require`/`node` path wrong at runtime | Paths resolve relative to `github.workspace`; the Step 5 `workflow_dispatch` smoke verifies wiring before the schedule is trusted. |
| #129 seed never lands | #129 RETAINs indefinitely — correct behaviour, not a bug. P1 is tracked but non-blocking. |

## Success-criteria → step map

SC 1 → Steps 1+3 (files exist, no profile touched). SC 2,3,4,5,6,9,10,12,16 →
Step 2 (unit tests). SC 7 → Step 3 (cron ordering) + Step 4 (strip retirement).
SC 8,11 → Step 1 (`declaredBlockOk`/`mintScopeOk` predicates) + Step 2 (two
independently-fixtured legs + the spotless-block/over-scoped-mint independence
tooth) + Step 3 (workflow header + mint scope the predicates guard). SC 13,14 →
Step 3 (SHA pins, base-context trigger). SC 15 → Step 1 (`auditLine`) + Step 3
(`apply` log).

— Staff Engineer 🛠️
