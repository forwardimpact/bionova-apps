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

The `vitest` 2.x tree also pins vulnerable transitive dependencies. Moving off
`vitest` 2.x is necessary for these, but for `vite` it is **not sufficient** —
see the mechanism note after the table:

| Transitive dep | Advisory | Severity |
|---|---|---|
| `vite` | `GHSA-fx2h-pf6j-xcff` — `server.fs.deny` bypass on Windows alternate paths | high |
| `vite` | `GHSA-4w7w-66w2-5vf9` — path traversal in optimized-deps `.map` handling | moderate |
| `vite` | `GHSA-v6wh-96g9-6wx3` — launch-editor NTLMv2 hash disclosure | moderate |
| `esbuild` | `GHSA-67mh-4wv8-2f99` — dev server accepts cross-origin requests | moderate |
| `postcss` | `GHSA-qx2v-qp2m-jg93` — XSS via unescaped `</style>` (older transitive copy) | moderate |

**Mechanism note — a bare `vitest` 2 → 3 bump does NOT clear the `vite` high.**
The #45 spike verified this against the committed lockfile. `vitest@3.2.6`
declares `vite: ^5.0.0 || ^6.0.0 || ^7.0.0-0`, so `bun install` keeps the already
resolved `vite@5.4.21` — which is still in the `<=6.4.2` window of
`GHSA-fx2h-pf6j-xcff`. Bumping to `vitest@3.2.6` alone left the tree with 2 highs
(this `vite` high plus the `next` follow-up owned by Spec 10). The `vite` high
clears only when the **resolved** `vite` reaches `≥ 6.4.3`. Two paths do that:

1. **Move to `vitest@4.x`** — its `vite` floor is `^6.0.0 || ^7.0.0 || ^8.0.0`, so
   the upgrade pulls a fixed `vite` with no override. Spike result:
   `vitest@4.1.9` resolved `vite@8.1.3` → 0 critical/high. This is a larger major
   jump (2 → 4, and `vite` 5 → 8) with a wider regression surface than the 2 → 3
   this spec was scoped around.
2. **Keep `vitest@3.2.6` and add an explicit `vite` override `≥ 6.4.3`** — the
   test runner stays on 3.x while the transitive `vite` is forced past the fix.
   Spike result: 0 critical/high, `vitest` unchanged at 3.2.6. Smaller blast
   radius on the test API; adds one `overrides` entry to carry.

Design owned the choice, weighing blast radius against the maintenance cost of a
pinned override. **Resolved: Path 2** — keep `vitest@3.2.6` and carry a floating
floor override `"overrides": { "vite": "^6.4.3" }` (caret, not a frozen pin, so
future vite-6 patches and advisories flow automatically). Path 1 was rejected on
blast radius (`vite` 5 → 8, three majors), co-land coupling with the Spec 10
`next` migration in one security window, and Node-floor creep (`vite` 8 needs
Node 20.19+, past engines `>=20`). **Removal trigger:** the override comes out
when the toolchain moves to `vitest@4.x`, as its own decoupled spec. The WHICH
lives in the design (`design-a.md`); this spec's success criteria stay keyed to
the outcome, not the mechanism. Either way, success criterion 3 (below) is the
real gate: it is advisory-keyed, so it fails until the resolved `vite` is
actually fixed.

**Reachability is the reason this is Track 3, not Track 1.** Despite the 9.8
score, the critical is only exploitable when the Vitest UI server is *listening*.
The test command (`vitest run`) does not start it, `@vitest/ui` is not a
declared dependency of the site, and no listening UI server runs in the
patient-facing deployment. Real production reach is near zero. It is sequenced
*after* the `next` migration (Spec 10), which closes the patient-reachable highs.
This spec is parallelizable and can be cleared opportunistically.

## Scope

**In scope** — everything in `products/polaris/site` that Vitest 3's breaking
changes touch:

| Area | What must hold | Evidence in the tree |
|---|---|---|
| `vitest.config.ts` | The config remains valid under Vitest 3 | `vitest.config.ts` |
| Test suites (5) | The suites pass against Vitest 3 | `src/__tests__/*.test.tsx` (admin-trial, trial-detail, sites, eligibility, search) |
| Test-time deps | `@testing-library/react` and `jsdom` stay compatible with the Vitest 3 / Vite 6 runtime | site `devDependencies` |

**Out of scope:**

- `next` and its 5 highs — Spec 10, independent branch.
- Authoring the CI audit gate and its allowlist — Spec 20. This spec carries a
  downstream obligation *to* Spec 20 (below), but does not itself create the
  allowlist.
- `handlers/` and `cli/` — carry no `vitest` dependency (`vitest` appears only in
  `products/polaris/site/package.json`).

## Downstream obligation to Spec 20

If the Spec 20 audit allowlist exists when this migration lands, this PR (or a
linked follow-up on the same branch) removes its entries for
`GHSA-5xrq-8626-4rwp` and the transitive `vite` / `esbuild` / `postcss` ids, so
the gate confirms the debt is gone rather than tolerating stale suppressions.
Success criterion 6 verifies this.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The resolved (locked) `vitest` version is `≥ 3.2.6` **and** the resolved `vite` is `≥ 6.4.3` (mechanism is a design concern — see `design-a.md`) | `bun pm ls vitest` and `bun pm ls vite` against the committed `bun.lock` |
| 2 | `bun audit` reports no advisory whose path is `vitest` — the critical `GHSA-5xrq-8626-4rwp` is gone | `bun audit` |
| 3 | `bun audit` no longer reports the transitive `vite` high `GHSA-fx2h-pf6j-xcff` | `bun audit` |
| 4 | All 5 site test suites pass | `cd products/polaris/site && bun run test` |
| 5 | Repo lint and site typecheck are clean | `just lint` and `cd products/polaris/site && bunx tsc --noEmit` |
| 6 | No Spec 20 allowlist entry remains for `GHSA-5xrq-8626-4rwp` or the retired `vite`/`esbuild`/`postcss` ids (if that allowlist exists) | grep the allowlist file |

## Notes for design

The migration is light — a devDependency bump plus config reconciliation, no
product runtime surface. The main risk is the `@testing-library/react` /
`jsdom` interplay with the Vite 6 runtime that Vitest 3 pulls in. Design should
confirm the render/query APIs the 5 suites use survive the Vite major, and
sequence the Spec 20 allowlist cleanup (criterion 6) against whether Spec 20 has
merged by the time this lands.

— Security Engineer 🔒
