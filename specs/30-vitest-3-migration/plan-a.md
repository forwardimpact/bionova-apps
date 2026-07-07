> **⚠️ PRE-FLIGHT — blocked on `design approved`, DO NOT MERGE.**
> This plan is staged under experiment [#108](https://github.com/forwardimpact/bionova-apps/issues/108)
> against the already-merged [`design-a.md`](./design-a.md) while the spec row
> sits at `design draft` on `wiki/STATUS.md`. It carries **no** ledger write and
> **must not** land until a trusted human writes `design approved` for spec 30.
> Held as a **draft PR**; the `kata-release-merge` gate cannot merge a draft. If
> approval never comes, discard this branch — the cost is one thrown-away plan.

# Plan 30 — `vitest` 2 → 3 + floated `vite` override

## Approach

Two manifest edits re-resolve the lockfile so the runner reaches `vitest@3.2.6`
and the transitive `vite` is forced to `≥6.4.3`; the skewed `jsdom@29` (#115)
lands to the exact manifest pin — a non-frozen re-resolve floats it (measured,
exp #124), with an explicit `bun update jsdom` as the guaranteed floor; reconcile
`vitest.config.ts` against Vitest 3, confirm the 5 suites pass under the Vite 6 +
jsdom 29 runtime, and remove the two now-resolved crit/high entries from
`security/audit-baseline.json` in the same PR so the audit gate self-corrects. WHAT/WHY live in
[`spec.md`](./spec.md); WHICH/WHERE in [`design-a.md`](./design-a.md).

## Measured grounding (exp #124 — supersedes the earlier prediction)

The full crit/high path is now **MEASURED**, not predicted. Security-engineer ran
the migration-verification spike Cycle 2 in a throwaway worktree off `main`
(`bbddb88`) and posted the result on [issue #45](https://github.com/forwardimpact/bionova-apps/issues/45)
/ [#124](https://github.com/forwardimpact/bionova-apps/issues/124):

- **next-15 + vitest-3 + jsdom-29 exactly as specced → 1 crit/high, not 0.** The
  `vitest` critical (`GHSA-5xrq-8626-4rwp`) and all 5 `next` highs cleared, but the
  `vite` high `GHSA-fx2h-pf6j-xcff` (vulnerable `<=6.4.2`, fixed `6.4.3`) did
  **not** clear — `vitest@3.2.7` transitively pulls `vite@5.4.21`.
- **Adding root `overrides: { "vite": "^6.4.3" }` → `vite@6.4.3` → 0 crit/high.**
- **A plain _incremental_ `bun install` does NOT close the `vite` high — the pair
  stays at 1.** bun 1.3.11 lock-stability keeps the nested `vite@5.4.21`
  (`<=6.4.2`, still vulnerable) even after the `vitest` bump, because `vite` is
  transitive under `vitest`/`vite-node`. Closing the high needs an **explicit
  forced `vite` override** — security measured two override configs, both → 0
  crit/high: the **superset `overrides: { "vite": "^7" }` → `vite@7.3.6`**
  (security's headline isolated run — off this plan's cap, a vite-**7** major),
  and this plan's **minimal `overrides: { "vite": "^6.4.3" }` → `vite@6.4.3`**
  (exp #124 — capped in vite-**6**). Same advisory result; the `^6.4.3` config is
  the on-target one. A bare `vitest` bump with **no** override is exp #124's FAIL
  verdict (residual 1 — the `vite` high). Do **not** rely on an unpinned regen to
  float `vite` off 5.4.21 — bun 1.3.11 lock-stability (above) means only an
  explicit override is measured to move it.

Consequences folded into this plan:

- **The root `vite ≥6.4.3` override is now a REQUIRED in-scope change, not
  optional.** Without it the residual is 1 (the `vite` high). This is why Steps 1
  and 5 pair the override + its GHSA removal with the `vitest` bump — the measured
  result confirms a bare `vitest` bump leaves the high open. Step 2's
  `bun pm ls vite ≥ 6.4.3` is its dedicated verification line.
- **Why the capped `^6.4.3`, not the superset `^7`.** Both override configs reach
  0 crit/high (measured), but `^7` drags `vite` across a _second_ major
  (5→7.3.6) — a wider migration this plan does not want. The `^6.4.3` override is
  the minimal lever: it clears
  the high while keeping `vite` in the 6 line the suite runtime is verified
  against (Step 4). It also defeats the incremental-install trap head-on — with
  the override present, even an incremental re-resolve floors `vite` at the fix
  (measured), so a bare `bun install` cannot silently leave `vite@5.4.21` and
  reopen the high. This is the [`bun.lock` bare-install-unsound trap (spec 110,
  #103)](https://github.com/forwardimpact/bionova-apps/issues/103) one layer up —
  the override, not the install command, is what makes the lock honest here.
- **No new crit/high from the vite-6 tree.** The measured combined end state is
  0 crit/high, so forcing `vite` across its 5→6 major via the override surfaces
  no new critical/high advisory. Scope does not reopen on that axis.
- **The override does not interact adversely with the jsdom 24→29 flip.** The
  measured tree already carried `jsdom@29` alongside the override and still
  reached 0 crit/high. `jsdom` has no `vite` in its subtree, so the override
  never touches it; the two majors are independent re-resolves that co-resolve
  clean.
- **The measured "0" is the COUPLED end state (spec 30 + spec 50 together).** The
  spike bumped `next` too, so `0 crit/high` requires both specs to land. Spec 30
  **alone** removes only the `vitest` crit + `vite` high (2 of 7); the 5 `next`
  highs stay live and baselined (spec 50 owns them). The "Coupled end state"
  invariant below is unchanged by the measurement.
- **Version note:** the spike measured `vitest@3.2.7`; this plan pins `3.2.6` —
  both are `≥3.2.6`, the floor that clears the crit, and both pull `vite@5.4.21`
  transitively, so both require the override. The pin is unaffected.
- **Scope caveat carried from Cycle 1:** the spike measures the **crit/high
  count only** — it is an `audit` read, not a test-run. Whether `vitest@3` runs
  the 5 suites **against the forced `vite@6` major** is UNMEASURED and belongs to
  this implementation. `vitest@3.2` supports `vite@6` (a documented combination,
  not a forced incompatibility), but Step 4 is the hard gate that proves the run.

## Security invariants (source: security-engineer)

These constrain the implementer beyond what the design states. Cited so they are
not lost between pre-flight and the eventual implement leg.

- **Atomic baseline removal.** The `vitest` pin, the root `vite` override, the
  re-resolved `bun.lock`, **and** the two `audit-baseline.json` GHSA removals
  land in **one** PR. `scripts/audit-gate.js` fails on any live crit/high GHSA
  id **not** covered by the baseline: remove a baseline entry while the advisory
  is still live and it fails closed (an introduced, unbaselined finding). The
  reverse — bump without removing the entry — leaves a live-but-resolved
  mismatch that logs a non-fatal `stale` warning on every run; separately, its
  `review_by` then fails closed on the nightly cron once the date lapses. Two
  distinct mechanisms, both satisfied by doing the removal in the same PR.
- **Deadline input.** Implement-by is **2026-07-24** — a hard fail-closed gate:
  the `check-audit.yml` nightly cron (`17 7 * * *`) enforces acceptance expiry on
  schedule, so both spec-30 entries (`review_by: 2026-07-24`) go loud the moment
  they lapse. Actionable constraint: land the fix before that date; do **not**
  extend either entry's `review_by` to buy time.
- **Remove by exact GHSA id, not tracking-issue number.** The baseline
  `review_spec` values are `#31`/`#29`, not the spec-dir numbers 30/50. Match on
  the GHSA id.
- **Regenerate the lock under bun 1.2.0.** `.tool-versions` pins `bun 1.2.0` and
  `bun.lock` is `lockfileVersion 1`; a newer bun rewrites the lock format (the
  deno-v3→v5 analog). This session's shell ran bun 1.3.11 — **do not** regen the
  lock with it. **Flag (out of scope for this PR):** every
  `oven-sh/setup-bun@v2.2.0` step in `.github/workflows/*` passes no
  `bun-version`, so CI drifts to latest bun and would not catch a 1.3.x lock
  rewrite. Do **not** edit the workflows here — pinning CI bun belongs in a
  separate item. This plan only requires regenerating and verifying the lock
  under 1.2.0 locally.
- **Lockfile-keyed success.** Verify with `bun pm ls vitest` and `bun pm ls vite`
  against the committed `bun.lock`, not against a manifest string.
- **Coupled end state.** crit/high → 0 needs **both** specs to land (2 entries
  here + 5 in spec 50). Spec 30 alone leaves the `next` highs open.
- **CSV tripwire — residual 1 = re-open, not celebrate (source: security-engineer,
  exp #45/#124).** When specs 30 + 50 both land, `critical_high_advisories` in the
  metrics CSV drops **7 → 0 in one step**. If it drops to **1**, the residual is
  the `vite` high `GHSA-fx2h-pf6j-xcff` and it means the root `overrides.vite ^6.4.3`
  input was lost between this plan and the merged diff (measured: `vitest@3.2.7`
  resolves its `^5` vite band to `vite@5.4.21` **without** the override → the high
  survives; the override forces `vite@6.4.3` → the high clears). Read a residual 1
  as override-lost, re-open — do not treat it as expected coupling slack. This
  plan fails that case **closed**, not silent: Step 5 removes the `vite`-high
  baseline entry in the same PR, so if the override is lost the still-live high is
  unbaselined and `audit-gate.js` fails closed (it cannot merge at residual 1).
- **Watcher-safe.** `plan-a.md` is not read by `scripts/spec-design-watcher.js`;
  staging it advances no ledger state.

Spec-30-specific:

- **Override lives in repo-root `package.json`.** bun honors `overrides` only
  from the workspace-root manifest; root has none today (confirmed). An entry in
  the site manifest is ignored.
- **Override shape `^6.4.3`** — floating caret: floor above the fix, capped
  within vite 6. Not a frozen pin (`6.4.3`), not widened to vite 7.
- **Both deps must move together.** The lock must resolve `vitest ≥ 3.2.6`
  **and** `vite ≥ 6.4.3`. A bare `vitest` bump leaves `vite@5.4.21` resolved and
  the `vite` high open — **measured** (exp #124): `vitest@3.2.7` transitively
  pulls `vite@5.4.21`, and only the root `^6.4.3` override floors it at the fix.
- **Remove exactly two ids:** `GHSA-5xrq-8626-4rwp` (crit) and
  `GHSA-fx2h-pf6j-xcff` (vite high). Do **not** touch the three sub-threshold
  moderates — they are not baselined.
- **Config-key survival.** Confirm `esbuild.jsx: "automatic"` in
  `vitest.config.ts` is still a valid Vitest 3 key.
- **jsdom 24 → 29 flip is IN SCOPE for this migration (Dependabot #115,
  `ebeb6a6`) — SUPERSEDES the design's "Hold `jsdom@24.1.3`" decision.** design-a.md
  § Key Decisions and its "jsdom@24 … unchanged" blast-radius line both assume
  `jsdom@24`; that assumption is stale. Do **not** re-pin `jsdom` to `24.1.3` —
  the site manifest is now `29.1.1` and reverting a security-cleared dev-dep bump
  is out of scope. **The skew is un-intentional.**
  `origin/main` carries `package.json → jsdom: 29.1.1` but `bun.lock` still
  resolves `jsdom@24.1.3` at both the site descriptor and the resolved entry
  (#115 bumped the manifest without re-resolving the lock). **The criterion is
  the RESOLVED lock, not the command that gets it there** (facilitator ask#1;
  security-engineer re-measurement, [issue #45 comment 4908981432](https://github.com/forwardimpact/bionova-apps/issues/45#issuecomment-4908981432)):
  in a fresh worktree off `main` @ `bbddb88` (bun 1.3.11), a plain **non-frozen**
  `bun install` DID reconcile `jsdom` 24 → 29.1.1 to satisfy the exact `29.1.1`
  manifest pin — so an explicit `bun update jsdom` is **belt-and-suspenders, not
  the only path**. The earlier "plain install leaves jsdom at 24" observation
  was likely a `--frozen`/dirty-state artifact, not a lock-stability law. This
  branch therefore **verifies the resolved `bun.lock` `jsdom` entry is `≥29`
  regardless of which install path produced it** (Step 2a / criterion 4); Step 2a
  still runs the explicit `bun update jsdom` as the guaranteed floor so the flip
  cannot depend on install-path luck, but the pass/fail signal keys on the
  resolved lock, not on that command being the one that moved it.
  Consequence: the `vitest@3.2.6` +
  `jsdom@29` pairing is **un-validated**, and this is also the **first exercise of
  the jsdom major at all** — #115's "green" ran on the un-re-resolved tree
  (`jsdom@24`), not 29. Step 4 names the flip with its own verification line so
  the "green didn't cover it" trap does not repeat one layer up. The migration
  outcome (spec SC 1–6) stays jsdom-version-agnostic — no criterion keys on the
  jsdom version — but the runtime the suites execute against is not the one the
  design reasoned over. **Severity LOW:** version-currency devDep bump, `bun audit`
  clean, no advisory masked — verification-integrity, not exposure; do not
  over-rotate into hardening.
- **Optional de-entangle pre-step (not required).** If cheaper triage is wanted:
  run `bun update jsdom` on `vitest@2` FIRST and confirm the 5 suites still pass,
  so a jsdom-29 failure is not confounded with a vitest-3 failure. Skippable —
  Step 4 gates the combined state regardless.
- **Hold** `@testing-library/react@16.3.2` — do not bump (no bump has landed for
  it; still Vite-6/React-18 compatible).
- **CI gates:** `check-test` + `check-quality`. No credential surface.

## Steps

### Step 1 — Pin the runner and add the root `vite` override

Move the runner to the patched major and force the transitive `vite` past the
fix from the workspace root.

- Modified: `products/polaris/site/package.json`, `package.json` (repo root)

`products/polaris/site/package.json` `devDependencies`:

```diff
-    "vitest": "2.1.9",
+    "vitest": "3.2.6",
```

Repo-root `package.json` — add a new top-level `overrides` block (none exists
today; place it after `devDependencies`):

```json
  "overrides": {
    "vite": "^6.4.3"
  }
```

Verify: `git diff` shows exactly these two edits; no `vitest` override, no
`vite` entry in the site manifest.

### Step 2 — Re-resolve the lockfile under bun 1.2.0

Regenerate `bun.lock` so the resolved tree reflects both edits.

- Modified: `bun.lock`

Run `bun install` **under bun 1.2.0** (activate via `.tool-versions` /
`mise`/`asdf`; do not use the ambient 1.3.x). Confirm the lock stays
`lockfileVersion 1`.

Verify: `bun pm ls vitest` reports `≥ 3.2.6`; `bun pm ls vite` reports
`≥ 6.4.3`; `head` of `bun.lock` still shows `"lockfileVersion": 1`. This step
**may** already float `jsdom` to `29.1.1` — a non-frozen `bun install` off a
clean tree reconciles the lock to the exact manifest pin (measured, exp #124).
Do not rely on it either way: Step 2a's explicit `bun update jsdom` is the
guaranteed floor, and criterion 4 keys on the resolved lock entry, not on which
command moved it.

### Step 2a — Confirm the `jsdom` lock entry reached the manifest pin

Close the un-intentional `origin/main` skew: `package.json` says `jsdom 29.1.1`
but the lock resolved `24.1.3` at both the descriptor and resolved entry. The
target is the **resolved lock, not a specific command** — Step 2's non-frozen
re-resolve may already have floated it to the exact pin (measured, exp #124), but
do not depend on that. Run `bun update jsdom` (under bun 1.2.0, same constraint as
Step 2) as the guaranteed floor: it is a no-op if Step 2 already moved the entry
and forces the flip if it did not. This is the first landing of the jsdom major
#115 declared — treat it as an in-scope change, not incidental lock churn.

Verify (feeds criterion 4): `bun pm ls jsdom` reports `≥ 29` (the manifest pins
`29.1.1`); `rg 'jsdom@24' bun.lock` returns nothing (both the descriptor and the
resolved entry moved); lock stays `lockfileVersion 1`. The pass keys on the
resolved lock regardless of which install path (Step 2 or this step) moved it.

### Step 3 — Reconcile `vitest.config.ts` against Vitest 3

Adjust only keys Vitest 3 renamed; keep the existing shape.

- Modified (only if a v3 rename requires it): `products/polaris/site/vitest.config.ts`

Confirm against the Vitest 3 migration notes that `esbuild.jsx: "automatic"`,
`test.environment: "jsdom"`, `test.globals`, `test.setupFiles`, `test.include`,
and the `@`→`src` `resolve.alias` are all still valid. Change a key **only** if
v3 renamed it; otherwise leave the file untouched.

Verify: `cd products/polaris/site && bunx tsc --noEmit` is clean and `bun run
test` parses the config and starts the run (a Vitest-3 config-key deprecation
surfaces in the log, not as a non-zero exit — Step 4's suite pass is the hard
gate).

### Step 4 — Run the 5 suites under the Vite 6 runtime + jsdom 29

Prove the render/query paths survive the Vite major **and** the jsdom major
together — this run is the first exercise of `vitest@3.2.6` + `jsdom@29`, and the
first exercise of `jsdom@29` at all (#115's green ran on `jsdom@24`).

- No file changes expected. If a suite needs a Vitest-3 API adjustment, edit the
  affected `src/__tests__/*.test.tsx` minimally.

Verify (criterion 4): first confirm the runtime under test is the resolved one,
reading the committed `bun.lock` — **not** any particular install command:
`bun pm ls vite` reports **`≥ 6.4.3`** (not merely that `vitest` bumped) and
`bun pm ls jsdom` reports **`≥ 29`** (the manifest pins `29.1.1`). Both assertions
key on the resolved lock entry regardless of the path that produced it — Step 2's
non-frozen re-resolve or Step 2a's explicit `bun update jsdom` (exp #124 measured
that a fresh non-frozen install already floats jsdom to the exact pin, so the
explicit update is belt-and-suspenders). A green suite run against a stale
`vite@5.4.21` would pass this step while silently leaving the `vite` high open
(exp #124 measured that the bare `vitest` bump keeps `vite@5.4.21` — the pass must
be read on the _forced_ vite-6 runtime, not the incremental-install default);
likewise a green run against a stale `jsdom@24` would pass on the wrong DOM
substrate, which is why the assertion is the resolved `≥29` lock entry, not the
command. Then `cd products/polaris/site && bun run test` —
all 5 suites (admin-trial, trial-detail, sites, eligibility, search) pass
**against the `jsdom@29` DOM substrate**. Read a failure here as a jsdom-29 DOM
interaction before a vitest-3 one — the optional de-entangle pre-step (flip jsdom
on vitest 2 first, § Security invariants) disambiguates the two if this goes red.
Do **not** re-pin jsdom to 24 to make it pass — that reverts #115.

### Step 5 — Remove the two resolved entries from the audit baseline

Shrink the gate baseline so it confirms the debt is gone instead of carrying
stale suppressions. **Same PR as Steps 1–2** (atomic-removal invariant).

- Modified: `security/audit-baseline.json`

Delete exactly the `GHSA-5xrq-8626-4rwp` and `GHSA-fx2h-pf6j-xcff` entries from
`advisories`. Leave every other entry (the 5 `next` ids owned by spec 50)
untouched.

Verify: `security/audit-baseline.json` is valid JSON; the two ids are absent;
the 5 `next` ids remain; `bun scripts/audit-gate.js` reports no unbaselined
crit/high from the `vitest`/`vite` paths.

### Step 6 — Full gate pass

Confirm the migration is clean end-to-end.

- No file changes.

Verify: `bun audit` reports no advisory on the `vitest` or `vite` path
(criteria 2–3); `just lint` clean (criterion 5); `bun scripts/audit-gate.js`
green.

Libraries used: none (dependency-graph + config change only).

## Risks

| Risk | Mitigation |
|---|---|
| Implementer regenerates `bun.lock` under bun 1.3.x, rewriting the lock format | Step 2 pins the regen to bun 1.2.0; CI setup-bun drifts to latest, so the format divergence would pass CI silently — verify `lockfileVersion 1` explicitly |
| A bare `vitest` bump lands without the root override, leaving `vite@5.4.21` + the high open | Step 1 pairs both edits; Step 2 verify gates on `bun pm ls vite ≥ 6.4.3` |
| Baseline entry removed but the advisory is not actually resolved (typo, partial resolve) | `audit-gate.js` treats an unmatched live id as unbaselined → fails closed; Step 6 runs the gate |
| A Vitest 3 config-key rename silently drops `esbuild.jsx` handling | Step 3 checks the key against v3 notes; Step 4 suites + typecheck gate it |
| The `jsdom@29` flip (#115) silently never lands, so CI would pass on the wrong DOM substrate | Criterion 4 keys on the **resolved** `bun.lock` `jsdom` entry (`≥ 29`), not on an install command — a non-frozen re-resolve floats it (measured, exp #124) and Step 2a's explicit `bun update jsdom` is the belt-and-suspenders floor. Step 2a verifies `rg 'jsdom@24' bun.lock` is empty; Step 4 confirms `bun pm ls jsdom ≥ 29` before reading the suite result |
| The `vitest@3.2.6` + `jsdom@29` pairing was never exercised together (#115's CI ran on `jsdom@24`); a jsdom-major DOM regression is misread as a vitest-3 break | Step 4 is the gate for the combined state; the optional de-entangle pre-step (jsdom flip on vitest 2 first) isolates a jsdom-29 failure from a vitest-3 one. Do **not** re-pin jsdom to 24 to sidestep — that reverts a security-cleared bump |

## Execution

Single unit, sequential — no decomposition. Route to an engineering agent via
`kata-implement` once spec 30 reaches `plan approved`. One PR carries every step
(1 through 6, including 2a's jsdom flip) — the atomic-removal invariant. This is a clean break: the override and pin
replace the vulnerable resolution outright; no shim, no fallback path.

— Staff Engineer 🛠️
