> **⚠️ SPECULATIVE BUILD-AHEAD — no `design approved`, DO NOT MERGE.**
> Staged under experiment [#323](https://github.com/forwardimpact/bionova-apps/issues/323)
> against the pre-flighted, still-unapproved design head
> [`1a79c73`](./design-a.md) (`design/220-dependency-compat-gate`, PR #295;
> STATUS row 220 held at `design draft`). This plan carries **no** ledger write
> and lands only when a trusted human writes `design approved` for spec 220 —
> and only THROUGH the `kata-release-merge` gate, never an admin-merge
> (obstacle #156). If human review moves the design head, re-derive against the
> new head; the two execution-surfaced corrections below (§Corrections) travel
> with the plan, not the design.

# Plan 220 — CI dependency-compat gate (engines-vs-runtime evaluator)

## Approach

Add one explicit CI check that reads every installed dependency's `engines.node`
and semver-tests it against one reconciled runtime pin — the load-bearing WHICH
from [`design-a.md`](./design-a.md): a green must mean the engines were
*evaluated*, never that a `bun install` exited 0. Five net-new files, one
one-line edit to `eslint.config.mjs`, no change to any existing gate. WHAT/WHY in
[`spec.md`](./spec.md); WHICH/WHERE in [`design-a.md`](./design-a.md).

This plan was **execution-verified on-branch** (exp #323): every step below was
applied to a worktree and the gate run end-to-end against a real 740-manifest
install tree — both fail-closed and pass paths — before this plan was written.
§Verification records the commands and results; §Corrections records the two
defects the paper design/plan could not see.

## Security invariants (soundness — source: spec 110 design-input)

- **The detector evaluates `engines`; it is never an install side-effect.** bun
  ignores `engines` entirely, and npm `--engine-strict` would self-heal or skip
  on a foreign lockfile — the false-green trap. The gate reads each installed
  manifest's `engines.node` itself (`Bun.semver.satisfies`) and fails closed on
  any range the pin does not satisfy.
- **No false green (SC4).** A resolved zero-manifest walk is breakage, not clean
  — the gate fails on an empty/missing tree. The parser (`Bun.semver`) is a bun
  built-in, so it can never be the absent tool. Every run prints
  `walked <N> manifests against Node <pin>`, so a skipped evaluation is
  observable.
- **Floor-equality reconciliation (SC2, D3).** The `.tool-versions nodejs` pin
  must be the *minimum* version `package.json engines.node` admits — editing
  either alone turns the check red, so the floor the evaluator compares against
  cannot silently drift. Validated on `main`: `22.23.1` == floor of `>=22.23.1`.
- **Weaken no existing gate (SC6).** A new isolated workflow + new scripts; no
  edit to `check-quality`/`check-audit`/any live gate. The one `eslint.config.mjs`
  edit is purely additive (see §Corrections) — it changes how *no* existing file
  lints.

## Steps

1. **`scripts/engines-gate.mjs`** (new) — the reconciler + evaluator. Reconciler
   reads `.tool-versions nodejs` and `package.json engines.node`, asserts the pin
   is admitted and is the floor (predecessor-not-admitted probe, borrow across
   minor/major with a sentinel so a drifted-up pin is caught). Evaluator walks
   the install tree, reads each `engines.node`, `Bun.semver.satisfies(pin, range)`,
   collects sorted violations, exits 1 on any. **The three inputs are env-
   overridable** (`ENGINES_GATE_TOOL_VERSIONS` / `_PACKAGE_JSON` / `_NODE_MODULES`)
   so the regression test drives committed fixtures without a live install —
   production defaults stay `.tool-versions` / `package.json` / `node_modules`.
2. **`scripts/engines-gate.test.js`** (new) — 11 cases driving committed
   fixtures: the SC1 fail (floor-exceeds-pin) + pass, disjoint-range parse both
   ways (eslint 10's real range), both SC2 drift directions + a floor-equality
   pass across a minor borrow, and four SC4 fail-closed cases (empty tree,
   missing tree, no `nodejs` line, no `engines.node`). Runs under `bun test` so
   `Bun.semver` is present.
3. **`scripts/fixtures/engines-gate/`** (new) — committed synthetic manifests +
   `.tool-versions`/`package.json` pairs. **The install-tree fixture dirs are
   named `modules/`, NOT `node_modules/`** (see §Corrections, Defect 1).
4. **`.github/workflows/check-compat.yml`** (new) — dedicated bun-runtime job on
   `pull_request` + `push` to `main` (SC3, D4). Runs
   `bun test scripts/engines-gate.test.js`, then `bun install`, then
   `bun scripts/engines-gate.mjs` — mirroring `check-audit.yml` (test the gate
   before trusting it). `contents: read`; `actions/checkout` +
   `oven-sh/setup-bun` reuse the repo's existing pinned SHAs.
5. **`eslint.config.mjs`** (edit, one block) — extend the scripts/products
   globals block to cover `**/*.mjs` and declare the `Bun` global (see
   §Corrections, Defect 2). Purely additive.

## Corrections (defects the paper design/plan could not see — exp #323)

Neither forces a design-a redirect — the design head `1a79c73` is implementable
as written. Both are plan/impl-level WHICH the design panel is structurally blind
to, fixed with additive steps.

- **Defect 1 — `node_modules/` fixture trap (`.gitignore`).** The repo
  `.gitignore` line 1 (`node_modules/`) matches *any* path segment named
  `node_modules`, so fixtures committed under `.../node_modules/...` are silently
  untracked → absent on a fresh CI checkout → the SC7 regression test fails to
  find its fixtures. The design's Fixtures row does not name the on-disk dir; a
  naive implementer mirrors reality and names it `node_modules/`. **Fix:** name
  the fixture install-trees `modules/` and give the evaluator a configurable walk
  root (`ENGINES_GATE_NODE_MODULES`). Production still walks `node_modules`.
  *Optional design hardening:* design-a could note the test-injection seam for the
  walk root — non-blocking.
- **Defect 2 — `.mjs` + `Bun` not linted (`eslint.config.mjs`).** The design
  names the file `scripts/engines-gate.mjs`, but the eslint globals block matches
  only `scripts/**/*.js` and declares no `Bun` global — so the new file fails the
  existing `lint:js` gate (`check-quality`) with 12 `no-undef` errors on
  `process`/`console`/`Bun`. Renaming to `.js` would not fix it (`Bun` is
  undeclared everywhere). **Fix:** add `**/*.mjs` to the block's `files` glob and
  `Bun: "readonly"` to its globals — additive, changes no existing file's lint.

## Verification (exp #323, worktree `plan/220-dependency-compat-gate`)

| Check | Command | Result |
| --- | --- | --- |
| Regression test (SC7) | `bun test scripts/engines-gate.test.js` | **11 pass / 0 fail** |
| Gate on real in-range tree (SC6, SC1-pass) | `bun scripts/engines-gate.mjs` | `walked 740 manifests` → **PASS**, exit 0 |
| Fail-closed on engine-floored bump (SC1) | raise a real installed dep's `engines.node` to `>=24.0.0`, re-run | **FAIL**, names the dep, exit 1 |
| Pass on compatible bump (SC1) | bump `@testing-library/jest-dom` 6.9.1 → 7.0.0 (`engines.node >=22`), `bun install`, re-run | **PASS**, exit 0 |
| Lint gate unbroken (SC6) | `bun run lint:js` | exit 0 (after Defect-2 fix) |
| Typecheck gate unbroken (SC6) | `bunx tsc --noEmit` | exit 0 |

## Risks

- **`node_modules` layout / symlinks.** The walk follows directory symlinks and
  fails closed on a zero-manifest resolve (SC4). A future bun linker that hoists
  differently must still resolve `N > 0` or the gate reds — the empty-tree guard
  is the backstop.
- **`Bun.semver` vs npm range semantics.** The disjoint-range fixture
  (`^20.19.0 || ^22.13.0 || >=24`, eslint 10's real range) pins parity; a
  divergence fails the test, not production. Live-validated: the installed
  eslint 10.8.0 carries exactly this range and the gate reads it correctly.
- **Floor-equality strictness (D3).** Deliberately reds a forward pin bump until
  `engines.node` is bumped in the same PR — the intended SC2 coupling, flagged
  for the approver in design-a.

— Security Engineer 🔒
