> **⚠️ PRE-FLIGHT — blocked on `design approved`, DO NOT MERGE.**
> Staged under experiment [#108](https://github.com/forwardimpact/bionova-apps/issues/108)
> against the already-merged [`design-a.md`](./design-a.md). Carries **no**
> ledger write and must not land until a trusted human writes `design approved`
> for spec 50. Held as a **draft PR**; the `kata-release-merge` gate cannot merge
> a draft.
>
> **⚠️ SPECULATIVE LEG.** Spec 50's `design-a.md` was **admin-merged**, and the
> spec row sits at `spec approved` — not `design draft`. Whether an admin merge
> counts as design approval is the **open governance principle** under
> exp [#98/#101](https://github.com/forwardimpact/bionova-apps/issues/98)
> (improvement-coach-owned). **This staged plan implies no design approval.** If
> the coach/human rules the admin-merge does not count and the design is
> reworked, discard this plan — the cost is one thrown-away draft.

# Plan 50 — `next` 14 → 15 on the patient surface

## Approach

Bump `next` to `≥15.5.18`, re-resolve the lockfile, promote
`outputFileTracingRoot` to a top-level config key, and hand-apply the Next 15
async request-API boundary (`await` on `params`/`searchParams`/`cookies()`)
across the enumerated 11-file set — including the admin JWT cookie read — then
prove per-route equivalence via the 5 suites, the standalone build (the type
gate), and smoke, and remove the 5 `next` GHSA entries from the audit baseline
in the same PR. WHAT/WHY in [`spec.md`](./spec.md); WHICH/WHERE in
[`design-a.md`](./design-a.md).

## Security invariants (source: security-engineer)

Shared with spec 30, plus the auth-path assertions unique to this migration.

- **Atomic baseline removal.** The `next` pin, re-resolved `bun.lock`, config
  move, async-boundary edits, **and** the 5 `audit-baseline.json` GHSA removals
  land in **one** PR. `scripts/audit-gate.js` fails on any live crit/high GHSA
  id **not** covered by the baseline: removing an entry while its advisory is
  still live fails closed (introduced, unbaselined). The reverse — bump without
  removing — logs a non-fatal `stale` warning every run, and separately its
  `review_by` fails closed on the nightly cron once the date lapses. Two
  mechanisms, both satisfied by doing the removal in the same PR.
- **Deadline input.** `2026-07-24` is a **hard** fail-closed gate
  (`check-audit.yml` cron `17 7 * * *`, acceptance-expiry enforced on schedule);
  all five spec-50 entries carry `review_by: 2026-07-24`.
- **Remove by exact GHSA id, not tracking-issue number.** The baseline
  `review_spec` for these five is `#29`, not the spec-dir number 50.
- **Regenerate the lock under bun 1.2.0.** `.tool-versions` pins `bun 1.2.0`;
  `bun.lock` is `lockfileVersion 1`. A newer bun rewrites the lock format. This
  session's shell ran bun 1.3.11 — **do not** regen with it. **Flag:** every
  `oven-sh/setup-bun@v2.2.0` step passes no `bun-version`, so CI drifts to latest
  bun; regenerate and verify the lock under 1.2.0 regardless.
- **Lockfile-keyed success.** Verify with `bun pm ls next` against the committed
  `bun.lock`, not the manifest string.
- **Coupled end state.** crit/high → 0 needs **both** specs (5 entries here + 2
  in spec 30). Spec 50 alone leaves the `vitest` crit and `vite` high open.
- **Watcher-safe.** `plan-a.md` is not read by `scripts/spec-design-watcher.js`.

Spec-50-specific:

- **Target `next ≥ 15.5.18`, not `15.5.16`.** `15.5.16` surfaces
  `GHSA-26hh-7cqf-hhc6` (segment-prefetch proxy bypass); it clears only at
  `15.5.18`. `GHSA-26hh` is **not** in the baseline today (the `14.2.35` tree
  does not carry it) — it must simply be **absent** post-bump, not removed.
- **Remove exactly five ids:** `GHSA-36qx-fr4f-26g5`, `GHSA-8h8q-6873-q5fj`,
  `GHSA-c4j6-fc7j-m34r`, `GHSA-h25m-26qc-wcjf`, `GHSA-q4gf-8mx6-v5v3`.
- **★ Auth-path (admin JWT read).** `buildAdminCtx`
  (`src/lib/build-ctx.ts:46-53`) reads `sb-staff-jwt` via `next/headers`
  `cookies()`, which becomes **async** in 15. The helper turns `async`; its sole
  caller `admin/trials/[id]/page.tsx` awaits it. The plan **must assert**:
  - Cookie-absent semantics preserved **byte-for-byte** — a missed `await`
    yields a Promise-typed token → silently `undefined` → an auth/RLS behavior
    change, not just a type error. When the cookie is absent, `ctx.data.token`
    stays `undefined` and `manageTrial` throws its documented precondition
    (no anon PATCH).
  - `buildCtxFromRequest` (`:58-68`) stays **synchronous** — `NextRequest.cookies`
    / `nextUrl.searchParams` are not async-ified in 15.
  - The service-role key stays **absent** from the web `env()` (`:15-21`).
- **Type gate is `next build` (criterion 4), NOT lint.** `just lint` (criterion
  5) is eslint + deno only. The build type-checks the generated
  `Promise<…>` `PageProps`/route types and fails on a missed `await`.
- **Config-key move.** `experimental.outputFileTracingRoot` → top-level
  `outputFileTracingRoot`. The standalone `server.js` path the Dockerfile depends
  on rides on this; criterion 4 asserts `server.js` emits at
  `products/polaris/site/`.
- **Caching posture unchanged.** Keep `force-dynamic` on all 8 handlers + all 8
  dynamic pages (16 declarations today). Next 15's uncached-by-default flip must
  change no observable posture.
- **Hold `react`/`react-dom` at `18.3.1`.** If a hard Next-15 App Router peer
  requirement surfaces at build, **return the spec to draft** rather than bumping
  React silently.
- **CI gates:** `check-test` / `check-quality` / `check-build` / `check-smoke` /
  `check-audit`.

## Steps

### Step 1 — Pin `next` and re-resolve the lockfile under bun 1.2.0

- Modified: `products/polaris/site/package.json`, `bun.lock`

```diff
-    "next": "14.2.35",
+    "next": "15.5.18",
```

Run `bun install` **under bun 1.2.0**; confirm the lock stays
`lockfileVersion 1`. Leave `react`/`react-dom` at `18.3.1`.

Verify: `bun pm ls next` reports `≥ 15.5.18`; `head bun.lock` shows
`"lockfileVersion": 1`.

### Step 2 — Promote `outputFileTracingRoot` to a top-level config key

- Modified: `products/polaris/site/next.config.mjs`

Move `outputFileTracingRoot` out of `experimental` to a top-level key; the value
(`../../../` from the site dir = monorepo root) is unchanged. `output:
standalone`, `transpilePackages`, and the `webpack` templates-stub alias stay.

```diff
   output: "standalone",
-  experimental: {
-    outputFileTracingRoot,
-  },
+  outputFileTracingRoot,
   transpilePackages: [
```

Verify: `next build` emits no `experimental.outputFileTracingRoot` deprecation
warning.

### Step 3 — Await the admin JWT cookie read (auth path)

Make `buildAdminCtx` async without changing cookie-absent semantics.

- Modified: `src/lib/build-ctx.ts`, `src/app/admin/trials/[id]/page.tsx`

```diff
-export function buildAdminCtx(searchParams: SearchParams = {}, args: Args = {}) {
-  const token = cookies().get(STAFF_JWT_COOKIE)?.value;
+export async function buildAdminCtx(searchParams: SearchParams = {}, args: Args = {}) {
+  const token = (await cookies()).get(STAFF_JWT_COOKIE)?.value;
```

`admin/trials/[id]/page.tsx`: `await buildAdminCtx(...)` at its sole call site.
**Do not** touch `buildCtxFromRequest`, `buildCtx`, `collapse`, or `env`.

Verify: cookie-absent path still yields `token === undefined`;
`buildCtxFromRequest` signature unchanged; `env()` has no service-role key;
`next build` type-checks the awaited value.

### Step 4 — Await `params` on the 4 param pages and 3 param handlers

`params` becomes `Promise<{id}>` in 15; await before use. Every target is
already `async`, so this is additive.

- Modified pages: `conditions/[id]/page.tsx`, `trials/[id]/page.tsx`,
  `trials/[id]/eligibility/page.tsx`, `admin/trials/[id]/page.tsx`
- Modified handlers: `api/conditions/[id]/route.ts`, `api/trials/[id]/route.ts`,
  `trials/[id]/eligibility/submit/route.ts`

Type each `params` prop as `Promise<{ id: string }>` and `await` it before
reading `.id` (which feeds `buildCtx({}, { id })`).

Verify: `next build` type-checks; no `params.id` read without an `await`.

### Step 5 — Await `searchParams` on the 4 searchParams pages

`searchParams` becomes a Promise in 15; await before `collapse()`.

- Modified: `search/page.tsx`, `sites/page.tsx`, `stories/page.tsx`,
  `trials/[id]/eligibility/page.tsx` (shared with Step 4 — one file, both props)

Type `searchParams` as `Promise<SearchParams>` and `await` before passing to
`collapse()` / `buildCtx`. `collapse()` itself is unchanged — it still consumes a
resolved object.

Verify: `next build` type-checks; `collapse()` signature untouched.

### Step 6 — Migrate the 5 test call sites to Promise-typed props

Suites call page components with plain-object props; wrap in `Promise.resolve`.

- Modified (only where a suite passes `params`/`searchParams`):
  `src/__tests__/*.test.tsx`

Wrap passed props, e.g. `await SearchPage({ searchParams: Promise.resolve({...}) })`.
Assertions unchanged.

Verify: `cd products/polaris/site && bun run test` — all 5 suites pass.

### Step 7 — Remove the 5 `next` entries from the audit baseline

**Same PR as Steps 1–6** (atomic-removal invariant).

- Modified: `security/audit-baseline.json`

Delete exactly `GHSA-36qx-fr4f-26g5`, `GHSA-8h8q-6873-q5fj`,
`GHSA-c4j6-fc7j-m34r`, `GHSA-h25m-26qc-wcjf`, `GHSA-q4gf-8mx6-v5v3`. Leave the 2
`vitest`/`vite` ids (spec 30) untouched. Do **not** add `GHSA-26hh` — it must be
absent, not baselined.

Verify: valid JSON; the 5 ids absent; `GHSA-26hh-7cqf-hhc6` absent from
`bun audit`; the 2 spec-30 ids remain.

### Step 8 — Full gate pass + caching-posture walk

- No file changes.

Verify: `bun audit` reports no `next`-path advisory (criteria 1–2);
`cd products/polaris/site && bun run build` succeeds and emits `server.js` at
`products/polaris/site/` (criterion 4, the type gate); `just lint` clean
(criterion 5); `just smoke` returns 200 on trial/search/conditions routes
(criterion 6); confirm all 16 `force-dynamic` declarations remain and the home
page (directive-less, reads no per-request data) keeps its posture (criterion 7);
`bun scripts/audit-gate.js` green.

Libraries used: none (framework bump + async-boundary edits only).

## Risks

| Risk | Mitigation |
|---|---|
| A missed `await` on the admin `cookies()` read silently changes auth/RLS behavior rather than erroring | Step 3 asserts byte-for-byte cookie-absent semantics; the `next build` type gate (Step 8) fails on a Promise-typed token |
| Implementer targets `15.5.16`, leaving `GHSA-26hh` open | Step 1 pins `≥15.5.18`; Step 7 verify checks `GHSA-26hh` absent from `bun audit` |
| Lock regenerated under bun 1.3.x, rewriting the format; CI drift hides it | Step 1 pins regen to 1.2.0 and verifies `lockfileVersion 1` explicitly |
| `outputFileTracingRoot` move changes the standalone `server.js` emit path | Value unchanged; Step 8 asserts `server.js` at `products/polaris/site/` |
| React 18.3.1 hits a hard Next-15 peer requirement at build | Build + smoke gate it; if it surfaces, return spec to draft — do not bump React silently |
| `buildCtxFromRequest` accidentally async-ified, breaking route-handler auth | Step 3 explicitly holds it synchronous; it reads `NextRequest`, not `next/headers` |

## Execution

Single unit, sequential — no decomposition. One PR carries all eight steps
(atomic-removal invariant). Route to an engineering agent via `kata-implement`
once spec 50 reaches `plan approved`. Clean break: the pin and awaited boundary
replace the vulnerable version and the sync request-API reads outright; no
compat shim, no dual-path fallback.

— Staff Engineer 🛠️
