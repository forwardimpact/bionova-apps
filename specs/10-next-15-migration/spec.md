# Spec 10 — Migrate `next` 14 → 15 to close 5 high advisories on the patient surface

**Classification:** Product-aligned. The advisories sit in the runtime that
serves the Patient / Advocate "Find a Relevant Trial" Big Hire; closing them
protects that job directly.

**Persona / job:** Patient / Advocate — *Find a Relevant Trial* (JTBD.md). The
public site is the surface this persona touches; every high advisory below is
reachable from a self-hosted deployment of it.

## Problem

`products/polaris/site` depends on `next@14.2.35`. `bun audit` (2026-07-04)
reports the npm/bun tree carries **20 advisories (1 critical, 6 high, 11
moderate, 2 low)**. Of the 6 tree-highs, **5 are carried by `next`**; the sixth
(`vite` `server.fs.deny` bypass, `GHSA-fx2h-pf6j-xcff`) is a `vitest` transitive
and belongs to Spec 30, not here. The 5 `next` highs are patched only in
`next ≥ 15.5.16` — a breaking major (14 → 15). No same-major release closes them.

**Deployment context matters for reachability.** The site is self-hosted: it
ships its own `products/polaris/site/Dockerfile` and `railway.toml` and runs the
Next.js standalone `server.js`. Self-hosting is the gating condition for several
of these advisories, so none of the 5 should be treated as non-reachable. The
single version bump closes all 5 at once — there is no cost to remediating every
one regardless of a per-advisory reachability argument.

The 5 `next` highs:

| Advisory | Class | Note on this deployment |
|---|---|---|
| `GHSA-c4j6-fc7j-m34r` (8.6) | SSRF in apps using WebSocket upgrades | Gated by self-hosting, which is present; framework-level, do not rely on non-reachability |
| `GHSA-8h8q-6873-q5fj` | DoS with Server Components | App Router renders Server Components — reachable |
| `GHSA-h25m-26qc-wcjf` | DoS via HTTP request deserialization in RSC | RSC request path — reachable |
| `GHSA-q4gf-8mx6-v5v3` | DoS with Server Components | App Router renders Server Components — reachable |
| `GHSA-36qx-fr4f-26g5` | Middleware / proxy bypass, Pages Router i18n | No `middleware.ts` or i18n today; closed by the upgrade, not relied on as a mitigation |

The migration also clears the `next`-carried moderates and lows in the same
`<15.5.16` window (CSP-nonce XSS `GHSA-gx5p-jg67-6x7h`, cache-poisoning variants
`GHSA-3g8h-86w9-wvmq` / `GHSA-vfv6-92ff-j949` / `GHSA-wfc6-r584-vfw7`,
image-optimizer DoS, request smuggling `GHSA-ggv3-7p47-pfv8`).

**Why this is spec-gated, not a Dependabot bump.** A green auto-merge cannot
ship a major to a patient-facing deployment without regression verification. A
breaking major that requires verifying the surface it touches is a **structural
finding**. The blast radius below must get staff-engineer architectural review
at design time.

## Scope

**In scope** — the surface in `products/polaris/site` that must keep working
across the major, given the breaking changes in Next.js 15:

| Area | What must hold | Evidence in the tree |
|---|---|---|
| Build config | Standalone build still emits `server.js` at `products/polaris/site/`; `output: standalone`, `transpilePackages`, and the custom `webpack` alias survive | `next.config.mjs` — including `experimental.outputFileTracingRoot`, which graduates to a stable top-level key in 15 |
| Route handlers (8) | Each returns the same responses; per-route caching intent stays explicit | `src/app/**/route.ts`; handlers already declare `export const dynamic = "force-dynamic"` |
| Pages (9, of which 4 dynamic) | Pages reading `params` / `searchParams` render equivalently | `src/app/**/page.tsx`; the 4 `[id]` routes |
| Request-API usage | Any `cookies()` / `headers()` reads keep working | `src/lib/build-ctx.ts` |
| `fetch` caching | Data fetches keep their current freshness behavior | `src/lib/build-ctx.ts` and page/handler fetches |
| Test suite | The 5 Testing Library suites pass unchanged | `src/__tests__` |

**Out of scope:**

- `handlers/` and `cli/` — carry no `next` dependency (`next` appears only in
  `products/polaris/site/package.json`).
- The `vitest` critical and its transitive `vite` / `esbuild` / `postcss` debt,
  including the 6th tree-high `GHSA-fx2h-pf6j-xcff` — Spec 30.
- CI detection and the audit gate — Spec 20.
- `react` / `react-dom` — remain 18.3.x unless the design finds a hard peer
  requirement for 15.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The resolved (locked) `next` version is `≥ 15.5.16`, not just the manifest string | `bun pm ls next` against the committed `bun.lock` |
| 2 | `bun audit` reports no advisory whose dependency path is `next` | `bun audit` |
| 3 | The full site test suite passes | `cd products/polaris/site && bun run test` |
| 4 | The production standalone build succeeds and emits `server.js` at `products/polaris/site/` | `cd products/polaris/site && bun run build` |
| 5 | Repo lint is clean | `just lint` |
| 6 | The stack boots and the patient-facing trial, search, and conditions routes return 200 | `just smoke` |
| 7 | Route handlers and pages that declare `force-dynamic` keep serving uncached, and no page silently switches caching mode | design-time caching-posture review, recorded in the design |
| 8 | The five `next` GHSAs are removed from `security/audit-baseline.json`; the #26 gate baseline shrinks accordingly | the five GHSA ids absent from `security/audit-baseline.json`; the #26 gate reports a smaller baseline and no stale-warning for those entries |

Criterion 8 closes the gap between audit-clean (crit 2) and the #27 / #22
Definition of Done: the fix must not only make `bun audit` clean of `next` but
also shrink the #26 gate's baseline, so the gate self-corrects instead of
carrying five now-resolved entries as a stale warning.

## Notes for design

The three reachable-today highs are Server-Component DoS / RSC request handling;
the correctness bar is that the RSC render path and the 8 route handlers behave
identically after the migration. Because the handlers already declare
`force-dynamic`, Next 15's caching-default flip (uncached-by-default) is largely
masked — design should confirm this holds per route rather than inherit the new
defaults blind. `smoke.sh` proves the stack boots and a small set of routes
return 200; it does not prove per-route response equivalence, so equivalence is
a design-and-review obligation, not something a single command asserts.

— Security Engineer 🔒
