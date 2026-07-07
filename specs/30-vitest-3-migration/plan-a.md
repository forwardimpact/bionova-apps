# Plan 30-a — `vitest` 2 → 3 + floated `vite` override

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Two manifest edits re-resolve the lockfile onto a fixed dependency tree: the
site runner moves to `vitest@3.2.6` and a new root `overrides` block floors the
transitive `vite` at `^6.4.3`. The 5 Testing Library suites run unchanged under
the Vite 6 runtime; the runner config is verified against Vitest 3 and touched
only if a key was renamed. The two crit/high advisories the change resolves are
then removed from the audit baseline so the #22 gate confirms the debt is gone
rather than carrying stale entries. Order matters: edit both manifests before
re-resolving, so `bun.lock` resolves once against the final constraint set.

## Steps

### Step 1 — Pin the site runner to `vitest@3.2.6`

Move the `vitest` devDependency across the breaking major.

- Modified: `products/polaris/site/package.json`

```diff
   "devDependencies": {
     ...
-    "vitest": "2.1.9",
+    "vitest": "3.2.6",
```

Verify: the line reads `"vitest": "3.2.6"`; no other dependency changes.

### Step 2 — Add the root `vite` override

Floor the resolved `vite` at the fix version. The block lives at the workspace
root because bun honors `overrides` only from the root manifest; the root has no
`overrides`/`resolutions` block today, so this introduces one.

- Modified: `package.json` (repo root)

```diff
   "workspaces": ["products/*/cli", "products/*/site", "products/*/handlers"],
   "engines": { "node": ">=20", "bun": ">=1.2" },
+  "overrides": {
+    "vite": "^6.4.3"
+  },
```

Verify: root `package.json` is valid JSON with the `overrides.vite` entry; Step 3's
`bun install` exercises it (a malformed override fails the install).

### Step 3 — Re-resolve the lockfile

Regenerate `bun.lock` against the new pin + override in one pass.

- Modified: `bun.lock`

```
bun install
```

Verify: `bun.lock` resolves `vitest@3.2.6` and `vite@≥6.4.3`; no `vite@5` remains
(`rg 'vite@5' bun.lock` returns nothing).

### Step 4 — Reconcile the runner config against Vitest 3

Confirm every key in `vitest.config.ts` is still valid under Vitest 3 / Vite 6;
change only a key Vitest 3 renamed.

- Modified (only if a rename is found): `products/polaris/site/vitest.config.ts`

The config uses `esbuild.jsx: "automatic"`, `test.{environment,globals,setupFiles,include}`,
and `resolve.alias`. All are Vitest-3/Vite-6 valid; expect **no change**. If
`vitest run` reports an unknown-option error, apply the documented v3 rename for
that key and nothing else.

Verify: `cd products/polaris/site && bunx vitest run` loads the config without an
unknown-option warning.

### Step 5 — Run the suites, typecheck, and lint

Prove the 5 suites pass unchanged and both halves of spec criterion 5 are clean;
no test-file edits are in scope for Spec 30.

- Touched: none (suites run as-is)

```
bun run test:site                              # = cd products/polaris/site && bun run test (→ vitest run)
cd products/polaris/site && bunx tsc --noEmit  # site typecheck (spec criterion 5, first half)
just lint                                      # repo lint: eslint + deno (spec criterion 5, second half) — or `bun run lint`
```

Verify: 5 suites green; site typecheck clean; `just lint` clean. Criterion 5 is
BOTH the typecheck and the repo lint — a lint regression from the `vite` 5→6
re-resolve must not slip through. If a suite fails on a Vite 6 runtime behavior,
stop and return to design — do not edit suites here.

### Step 6 — Trim the two resolved advisories from the audit baseline

Remove Spec 30's two crit/high entries so the #22 gate baseline shrinks rather
than carrying resolved debt.

- Modified: `security/audit-baseline.json`

Delete these two keys from `advisories` (both `review_spec: "#31"`):

| GHSA | package | severity |
| --- | --- | --- |
| `GHSA-5xrq-8626-4rwp` | vitest | critical |
| `GHSA-fx2h-pf6j-xcff` | vite | high |

Leave every `next`-carried entry untouched — those are Spec 50's to remove.

Note: the advisories leaving the resolved tree (spec criteria 2/3) is the effect
of Steps 1–3, which `bun audit` reports directly. This edit does not change what
`bun audit` raw-reports — it stops the #22 gate from carrying resolved entries.

Verify: `security/audit-baseline.json` is valid JSON with exactly those two keys
removed and every `next` entry intact.

### Step 7 — Confirm the gate

Run the CI dependency-audit gate locally (`scripts/audit-gate.js` diffs
`bun audit --json` against the baseline; passes iff no crit/high sits outside it).

- Touched: none

```
bun audit                    # criteria 2/3: GHSA-5xrq (crit) + GHSA-fx2h (vite high) gone from the resolved tree
bun scripts/audit-gate.js    # the #22 gate: 0 crit/high beyond the trimmed baseline
```

Verify: `bun audit` no longer lists `GHSA-5xrq-8626-4rwp` or
`GHSA-fx2h-pf6j-xcff`; `bun scripts/audit-gate.js` exits 0, with no new crit/high
surfaced from the `vite` 5→6 move.

Libraries used: none (dependency-tree + config change only).

## Risks

- **A Vitest 3 config-key rename surfaces at Step 4.** Low: the four `test`
  keys, `resolve.alias`, and `esbuild.jsx` are all v3-valid. If one warns, apply
  only the rename — a config rewrite to the v3 project/workspace API is out of
  scope (design § Key Decisions).
- **The `overrides` caret later floats `vite` into 7.x.** The floor is `^6.4.3`,
  capped within vite 6; a vite-7 jump needs an explicit widen and will not happen
  on `bun install`. Do not use a frozen `6.4.3` pin — it freezes out vite-6
  security patches (design § Key Decisions).
- **`postcss` looks unresolved after this lands.** Expected: the vulnerable
  `postcss` copy is `next/postcss@8.4.31` on Spec 50's tree, not Spec 30's. It is
  moderate (below the crit/high gate) and is Spec 50's to clear — not a Spec 30
  regression.

## Execution

Single sequential unit; route to an engineering agent. Steps 1–3 must run in
order (both manifests before the lock re-resolve). Spec 30 and Spec 50 are the
coupled 0-advisory countermeasure but touch disjoint files (`vitest`/root
`overrides` here; `next`/app-router there) and different baseline keys, so the
two plans can be implemented independently and in either order; the gate reaches
0 crit/high only once **both** land.

— Staff Engineer 🛠️
