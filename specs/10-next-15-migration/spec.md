# Spec 10 — Migrate `next` 14 → 15 to close 6 high advisories on the patient surface

**Classification:** Product-aligned. The advisories sit in the runtime that
serves the Patient / Advocate "Find a Relevant Trial" Big Hire; closing them
protects that job directly.

**Persona / job:** Patient / Advocate — *Find a Relevant Trial* (JTBD.md). The
public site is the surface this persona touches; every high advisory below is
reachable, or latently reachable, from it.

## Problem

`products/polaris/site` depends on `next@14.2.35`. `bun audit` (2026-07-04)
reports the npm/bun tree carries **20 advisories (1 critical, 6 high, 11
moderate, 2 low)**. Six of the highs are carried by `next` and are patched only
in `next ≥ 15.5.16` — a breaking major (14 → 15). No same-major release closes
them.

The six highs, by reachability against the site's **current** configuration
(App Router, no `middleware.ts`, no `next/image`):

| Advisory | CVSS band | What it is | Reachable today? |
|---|---|---|---|
| `GHSA-c4j6-fc7j-m34r` | high (8.6) | SSRF in apps using WebSocket upgrades | Latent — no WS upgrade path today, but framework-level |
| `GHSA-8h8q-6873-q5fj` | high | DoS with Server Components | **Yes** — App Router renders Server Components |
| `GHSA-h25m-26qc-wcjf` | high | DoS via HTTP request deserialization in RSC | **Yes** — RSC request path |
| `GHSA-q4gf-8mx6-v5v3` | high | DoS with Server Components | **Yes** — App Router renders Server Components |
| `GHSA-36qx-fr4f-26g5` | high | Middleware / proxy bypass, Pages Router i18n | Latent — no middleware, App Router only |
| (i18n/proxy class) | high | Middleware / proxy redirect handling | Latent — no middleware |

The migration also clears the `next`-carried moderates/lows (CSP-nonce XSS,
several cache-poisoning variants, image-optimizer DoS, request smuggling in
rewrites).

**Why this is spec-gated, not a Dependabot bump.** A green auto-merge cannot
ship a major to a patient-facing deployment without regression verification.
Per work-definition.md § Classification tests, a breaking major that requires
verifying the surface it touches is a **structural finding**. The blast radius
below must get staff-engineer architectural review at design time.

## Scope

**In scope** — everything in `products/polaris/site` that Next.js 15's breaking
changes touch:

| Area | Evidence in the tree |
|---|---|
| `next.config.mjs` | Uses `experimental.outputFileTracingRoot`, which graduates to a stable top-level key in 15; `output: "standalone"`, `transpilePackages`, and the custom `webpack` alias must survive the bump |
| Route handlers (8) | `src/app/api/**/route.ts` — GET handlers are no longer cached by default in 15; per-route caching intent must be made explicit |
| Dynamic pages (~13) | `src/app/**/page.tsx` reading `params` / `searchParams` — these become async in 15 |
| Request APIs | Any `cookies()` / `headers()` usage becomes async-only in 15 |
| `fetch` caching | `src/lib/build-ctx.ts` and page/handler `fetch` calls — default `fetch` caching flips from cached to uncached in 15 |
| Test suite | The 5 Testing Library suites under `src/__tests__` must pass unchanged against the migrated surface |
| Deploy | The standalone build + Dockerfile runner path must still emit `server.js` at `products/polaris/site/` |

**Out of scope:**

- `handlers/` and `cli/` — carry no `next` dependency (confirmed: `next`
  appears only in `products/polaris/site/package.json`).
- The `vitest` critical and its transitive `vite`/`esbuild`/`postcss` debt —
  Spec 30, independent migration.
- CI detection and the audit gate — Spec 20.
- `react` / `react-dom` — remain 18.3.x unless the design finds a hard peer
  requirement for 15.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | Site depends on `next ≥ 15.5.16` | `products/polaris/site/package.json` |
| 2 | `bun audit` reports zero `next`-carried high advisories | `bun audit` |
| 3 | Full site test suite passes | `cd products/polaris/site && bun run test` |
| 4 | Production build succeeds and emits the standalone `server.js` at the expected path | `bun run build` |
| 5 | Lint is clean | `bun run lint` |
| 6 | Every route handler and dynamic page renders equivalently to pre-migration behavior | `just smoke` |
| 7 | No caching-default regression silently changes a patient-visible response | design-time behavior review + smoke |

## Notes for design

The three reachable-today highs are all Server-Component DoS / RSC request
handling — the migration's correctness bar is that the RSC render path and the
8 route handlers behave identically after the caching-default flip. The two
latent highs (middleware/i18n, WebSocket SSRF) close for free but are not the
urgent driver. Design should decide the caching posture explicitly rather than
inheriting 15's new defaults blind.

— Security Engineer 🔒
