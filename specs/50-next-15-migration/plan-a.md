# Plan 50-a — `next` 14 → 15 on the patient surface

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

The pin change is trivial; the work is the async request-API boundary Next 15
makes breaking. `params`, `searchParams`, and `next/headers` `cookies()` become
Promises, so every enumerated call site awaits them. `NextRequest`
(`.cookies`, `.nextUrl.searchParams`) stays synchronous, so `buildCtxFromRequest`
and the handlers that read auth through it are untouched. The migration is
additive — every target page/handler is already `async` — so it inserts `await`s,
it does not rewrite control flow. The build's type-check is the safety net: props
become `Promise`-typed, so a missed `await` fails `next build`. Sequence: bump +
re-resolve, promote the config key, walk the async boundary (pages → handlers →
`buildAdminCtx`), migrate the 5 test call-site files, then trim the 5 `next`
advisories from the baseline and gate.

## Steps

### Step 1 — Bump the framework pin to `next@15.5.18`

Move `next` across the breaking major. Floor is `15.5.18` — `15.5.16` is
spike-proven to leave `GHSA-26hh` open (design § Problem).

- Modified: `products/polaris/site/package.json`

```diff
   "dependencies": {
     ...
-    "next": "14.2.35",
+    "next": "15.5.18",
```

Hold `react`/`react-dom` at `18.3.1` (design § Key Decisions — React 19 is a
separable blast radius the spec excludes).

Verify: the line reads `"next": "15.5.18"`; react/react-dom unchanged.

### Step 2 — Re-resolve the lockfile

- Modified: `bun.lock`

```
bun install
```

Verify: `bun.lock` resolves `next@15.5.18` against the committed `react@18.3.1`;
no react version change pulled.

### Step 3 — Promote `outputFileTracingRoot` to top-level

Next 15 graduates this key from `experimental` to stable; the experimental key
warns or is dropped. The standalone `server.js` path the Dockerfile depends on
rides on it — its value is unchanged (monorepo root).

- Modified: `products/polaris/site/next.config.mjs`

```diff
   const nextConfig = {
     output: "standalone",
-    experimental: {
-      outputFileTracingRoot,
-    },
+    outputFileTracingRoot,
     transpilePackages: [
```

Keep `output: "standalone"`, `transpilePackages`, and the webpack templates-stub
alias as-is.

Verify: `next.config.mjs` has a top-level `outputFileTracingRoot` and no
`experimental` block.

### Step 4 — Await `params` in the 4 param pages

Type `params` as a Promise and await it before reading `.id`.

- Modified:
  - `src/app/conditions/[id]/page.tsx`
  - `src/app/trials/[id]/page.tsx`
  - `src/app/admin/trials/[id]/page.tsx`
  - `src/app/trials/[id]/eligibility/page.tsx` (also does Step 5)

Pattern (per file):

```diff
-}: {
-  params: { id: string };
-}) {
-  const ctx = buildCtx({}, { id: params.id });
+}: {
+  params: Promise<{ id: string }>;
+}) {
+  const { id } = await params;
+  const ctx = buildCtx({}, { id });
```

Then replace remaining `params.id` reads with `id` (e.g. `admin` page's
`AdminSidebar trialId={id}` and `{trial?.name ?? id}`).

Verify: no `params.id` reference remains without a preceding `await params`.

### Step 5 — Await `searchParams` in the 4 searchParams pages

Type `searchParams` as a Promise and await it before `collapse()`/reads.

- Modified:
  - `src/app/search/page.tsx` — `buildCtx(searchParams)` → `buildCtx(await searchParams)`
  - `src/app/sites/page.tsx` — await, then read `.specialty`
  - `src/app/stories/page.tsx` — await, then read `.condition`
  - `src/app/trials/[id]/eligibility/page.tsx` — await, then read `.score` (shared with Step 4)

Pattern (searchParams-only pages):

```diff
-}: {
-  searchParams: Record<string, string | string[] | undefined>;
-}) {
-  const ctx = buildCtx(searchParams);
+}: {
+  searchParams: Promise<Record<string, string | string[] | undefined>>;
+}) {
+  const sp = await searchParams;
+  const ctx = buildCtx(sp);
```

For the eligibility page, both props become Promises; await both, then
`sp.score`. `collapse()` and `buildCtx` are unchanged — they still take a
resolved object; only the resolution point moves.

Verify: no `searchParams.<key>` read remains without a preceding `await`.

### Step 6 — Await `params` in the 3 dynamic route handlers

`NextRequest` stays sync; only the second-arg `params` becomes a Promise.

- Modified:
  - `src/app/api/conditions/[id]/route.ts`
  - `src/app/api/trials/[id]/route.ts`
  - `src/app/trials/[id]/eligibility/submit/route.ts`

Pattern:

```diff
   request: NextRequest,
-  { params }: { params: { id: string } },
+  { params }: { params: Promise<{ id: string }> },
 ) {
+  const { id } = await params;
```

Then replace `params.id` with `id` (the `submit` handler uses it twice — `args`
and the redirect URL). Leave the non-`[id]` API routes (`about`, `health`,
`search`, `sites`, `stories`) untouched — they read no `params`.

Verify: the 3 handlers await `params`; `buildCtxFromRequest` and the 5 sync
handlers are byte-identical.

### Step 7 — Make `buildAdminCtx` async for the awaited `cookies()`

`next/headers` `cookies()` becomes async; `buildAdminCtx` is its only caller.

- Modified: `src/lib/build-ctx.ts`

```diff
-export function buildAdminCtx(searchParams: SearchParams = {}, args: Args = {}) {
-  const token = cookies().get(STAFF_JWT_COOKIE)?.value;
+export async function buildAdminCtx(searchParams: SearchParams = {}, args: Args = {}) {
+  const token = (await cookies()).get(STAFF_JWT_COOKIE)?.value;
```

`buildCtx` and `buildCtxFromRequest` are unchanged — neither reads
`next/headers`. The sole caller, `src/app/admin/trials/[id]/page.tsx`, awaits it:

```diff
-  const ctx = buildAdminCtx({}, { id });
+  const ctx = await buildAdminCtx({}, { id });
```

Verify: `buildAdminCtx` is `async`; the admin page awaits it.

### Step 8 — Migrate the 5 test call-site files

Wrap page props in `Promise.resolve(...)` to match the now-`Promise`-typed
props. Assertions and mocks are unchanged.

- Modified (7 call sites across 5 files):

| File | Call sites | Wrap |
| --- | --- | --- |
| `src/__tests__/eligibility.test.tsx` | 2 | `params: Promise.resolve({ id }), searchParams: Promise.resolve({...})` |
| `src/__tests__/search.test.tsx` | 1 | `searchParams: Promise.resolve({ condition })` |
| `src/__tests__/sites.test.tsx` | 1 | `searchParams: Promise.resolve({ specialty })` |
| `src/__tests__/trial-detail.test.tsx` | 1 | `params: Promise.resolve({ id })` |
| `src/__tests__/admin-trial.test.tsx` | 2 | `params: Promise.resolve({ id })` |

The `admin-trial.test.tsx` `next/headers` mock (`cookies: () => ({ get })`) does
**not** need changing — `await` on that non-thenable return is a no-op, so the
sync mock survives Step 7. Only the page-prop wrapping is required.

Verify: each `await <Page>({...})` call passes `Promise`-wrapped props.

### Step 9 — Trim the 5 resolved `next` advisories from the baseline

Remove Spec 50's five crit/high `next` entries so the audit gate baseline shrinks
instead of carrying stale entries.

- Modified: `security/audit-baseline.json`

Delete these five keys from `advisories` (all `package: next`, `review_spec: "#29"`):

| GHSA | severity |
| --- | --- |
| `GHSA-36qx-fr4f-26g5` | high |
| `GHSA-8h8q-6873-q5fj` | high |
| `GHSA-c4j6-fc7j-m34r` | high |
| `GHSA-h25m-26qc-wcjf` | high |
| `GHSA-q4gf-8mx6-v5v3` | high |

Leave the `vitest`/`vite` entries — those are Spec 30's to remove.

Verify: valid JSON with exactly those five keys gone; `bun audit` reports the
`next` highs cleared.

### Step 10 — Build, lint, smoke, suites, gate

- Touched: none

```
cd products/polaris/site && bun run build   # standalone build = the TYPE GATE
just lint                                     # eslint + deno — NOT the type gate
just smoke                                    # boot + 200s
bun run test:site                             # 5 suites under Next 15
```

Verify: `build` emits `server.js` at `products/polaris/site/` and type-checks
clean (a missed `await` fails here); lint/smoke/suites green; the
`dependency-audit` gate passes with the 5 `next` entries removed.

Libraries used: none (framework bump + call-site migration only).

## Risks

- **The type gate is the BUILD, not lint.** A missed `await` leaves a `Promise`
  where a string is expected; `next build` type-checks by default (no
  `typescript.ignoreBuildErrors` in `next.config.mjs`) and fails on it, but
  `just lint` is eslint + deno only and will NOT catch it. Do not treat a green
  lint as the type gate.
- **`15.5.16` is not enough.** It surfaces `GHSA-26hh-7cqf-hhc6`
  (segment-prefetch bypass) which clears only at `15.5.18`. Target `15.5.18` (or
  later 15.5.x) — never `15.5.16`.
- **A hard Next-15 React-19 peer requirement could surface at build.** Low: the
  #45 spike resolved `15.5.18` against `react@18.3.1`. If a hard requirement
  appears, return the spec to draft — do not bump React silently (design §
  Key Decisions). Build + smoke are the gate.
- **`admin-trial.test` cookies mock.** Its sync `cookies: () => ({ get })`
  survives the `await cookies()` change (await on a non-thenable is a no-op) — no
  mock edit needed. Wrapping the page props (Step 8) IS still required.
- **Caching-default flip.** All 8 route handlers and all 8 dynamic pages already
  declare `force-dynamic`; the sole directive-less page (`app/page.tsx`) reads no
  per-request data. Next 15's uncached-by-default flip changes no observable
  posture — criterion 7 is a per-page confirmation, not a change. Do not add or
  drop `force-dynamic` directives.
- **Standalone output path.** `outputFileTracingRoot` keeps the monorepo-root
  value across the Step 3 move; the build must still emit `server.js` under
  `products/polaris/site/` (Dockerfile depends on it) — Step 10 asserts it.

## Execution

Single sequential unit; route to an engineering agent. Steps 1–3 are the
dependency/config base; Steps 4–8 are the code+test migration (do 8 after 7 so
the async ripple is settled); Steps 9–10 finalize and gate. The 11 code files
(7 pages — `conditions/[id]`, `trials/[id]`, `trials/[id]/eligibility`,
`admin/trials/[id]`, `search`, `sites`, `stories`; 3 handlers —
`api/conditions/[id]`, `api/trials/[id]`, `trials/[id]/eligibility/submit`; plus
`src/lib/build-ctx.ts`) and 5 test files must all land together — a partial
migration fails `next build`.
Spec 30 and Spec 50 are the coupled 0-advisory countermeasure but touch disjoint
files and different baseline keys, so the two plans implement independently and
in either order; the gate reaches 0 crit/high only once **both** land.

— Staff Engineer 🛠️
