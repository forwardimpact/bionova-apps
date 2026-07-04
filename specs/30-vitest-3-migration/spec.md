# Spec 30 — Migrate `vitest` 2 → 3 to close the critical and its transitive debt

**Classification:** Internal (test toolchain). No product runtime changes. The
critical is dev-only; this spec clears it and the transitive supply-chain debt
it drags in.

**Persona / job:** No direct persona. It hardens the developer/CI toolchain the
team relies on to keep the patient-facing site correct.

## Problem

`products/polaris/site` depends on `vitest@2.1.9` (a devDependency). `bun audit`
(2026-07-04) reports it carries **1 critical**, `GHSA-5xrq-8626-4rwp` (CVSS
9.8): when the Vitest UI server is listening, an arbitrary file can be read and
executed. Patched only in `vitest ≥ 3.2.6` — a breaking major (2 → 3). No
same-major release closes it.

The `vitest` 2.x tree also pins vulnerable transitive dependencies that only
clear when `vitest` moves to 3.x:

| Transitive dep | Advisory | Severity |
|---|---|---|
| `vite` | `GHSA-fx2h-pf6j-xcff` — `server.fs.deny` bypass on Windows alternate paths | high |
| `vite` | `GHSA-4w7w-66w2-5vf9` — path traversal in optimized-deps `.map` handling | moderate |
| `vite` | `GHSA-v6wh-96g9-6wx3` — launch-editor NTLMv2 hash disclosure | moderate |
| `esbuild` | `GHSA-67mh-4wv8-2f99` — dev server accepts cross-origin requests | moderate |
| `postcss` | `GHSA-qx2v-qp2m-jg93` — XSS via unescaped `</style>` (older transitive copy) | moderate |

**Reachability is the reason this is Track 3, not Track 1.** Despite the 9.8
score, the critical is only exploitable when the Vitest UI server is *listening*
— a mode the test suite (`vitest run`) does not start, and which never runs in
the patient-facing deployment. Real production reach is near zero. It is
sequenced *after* the `next` migration (Spec 10), which closes the actually
patient-reachable highs. This spec is parallelizable and can be cleared
opportunistically.

## Scope

**In scope** — everything in `products/polaris/site` that Vitest 3's breaking
changes touch:

| Area | Evidence in the tree |
|---|---|
| `vitest.config.ts` | Vitest 3 changes config defaults and removes deprecated options; the config must be reconciled |
| Test suites (5) | `src/__tests__/*.test.tsx` (admin-trial, trial-detail, sites, eligibility, search) must pass unchanged against Vitest 3 |
| Test-time deps | `@testing-library/react`, `jsdom` compatibility with the Vitest 3 / Vite 6 runtime must hold |

**Out of scope:**

- `next` and the 6 highs — Spec 10, independent branch.
- The CI audit gate — Spec 20. Once this migration lands, Spec 20's allowlist
  entries for `GHSA-5xrq-8626-4rwp` and the transitive `vite`/`esbuild`/`postcss`
  ids must be removed so the gate confirms the debt is gone.
- `handlers/` and `cli/` — carry no `vitest` dependency (confirmed: `vitest`
  appears only in `products/polaris/site/package.json`).

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | Site depends on `vitest ≥ 3.2.6` | `products/polaris/site/package.json` |
| 2 | `bun audit` reports the `vitest` critical `GHSA-5xrq-8626-4rwp` cleared | `bun audit` |
| 3 | The transitive `vite` high `GHSA-fx2h-pf6j-xcff` is cleared | `bun audit` |
| 4 | All 5 site test suites pass | `cd products/polaris/site && bun run test` |
| 5 | Lint and typecheck are clean | `bun run lint && bunx tsc --noEmit` |

## Notes for design

The migration is light — a devDependency bump plus config reconciliation, no
product runtime surface. The main risk is the `@testing-library/react` /
`jsdom` interplay with the Vite 6 runtime that Vitest 3 pulls in. Design should
confirm the render/query APIs the 5 suites use survive the Vite major, and note
which Spec 20 allowlist entries this migration retires.

— Security Engineer 🔒
