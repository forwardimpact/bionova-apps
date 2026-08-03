# Plan 280-a: Screener result carries the trial's recruiting status

Spec: [spec.md](spec.md). Design: [design-a.md](design-a.md). This plan says HOW
and in WHAT ORDER to implement the design.

## Approach

Land the shared `recruitingStatusLine` resolver first, then wire it into each of
the two result surfaces, then the tests. The resolver is the load-bearing piece
— both surfaces import the same function, so the fail-safe rule (allowlist
`recruiting`; every other value → a not-open line) cannot drift. The handler
pays one net-new `trials?…&select=status` read; the web page reuses the `status`
`showTrial` already selects. Nothing is removed (additive per the spec's
compatibility stance), so every step is a pure addition beside the existing fit
result.

Libraries used: none. (The resolver is plain JS; the CLI template renders
through the already-wired `libtemplate` mustache path; the site test uses the
existing `vitest` + `@testing-library/react` harness.)

## Resolver string table

The design leaves the exact strings plan-owned. These are the strings the
resolver returns; the plan-clean invariant is one-line-per-value, value-only, no
raw enum token (C5), spec-10 non-judgmental voice (S4):

| `status` value | Returns |
| --- | --- |
| `recruiting` | `null` — no line (S3, C3) |
| `active_not_recruiting` | `This trial is not accepting new participants right now.` |
| `completed` | `This trial has finished enrolling.` |
| `not_yet_recruiting` | `This trial is not yet open to participants.` |
| any other value, `null`, `undefined` | `This trial is not confirmed open to new participants.` (fail-safe) |

The fail-safe line is deliberately distinct from the three named lines: it makes
no claim about *why* the trial is not open, only that open status is not
confirmed — the safe reading for an unknown value (closes #298's fail-open
path).

## Step 1: Add the shared resolver

Create the pure resolver that is the sole home of the open/not-open rule.

- **Created:** `products/polaris/handlers/src/recruiting-status.js`
- **Modified:** `products/polaris/handlers/src/index.js`

```js
// recruiting-status.js
/**
 * Plain-language recruiting-status line for a trial's screener result.
 *
 * Allowlists `recruiting` as the single open state (returns null — render as
 * today). Every other value — the three named non-recruiting states, plus any
 * unknown, unlisted, or absent value — returns a not-open line. This is
 * recruiting-vs-not by construction, not a closed enum: a future status value
 * falls to the fail-safe line with no code change (#298).
 *
 * @param {string | null | undefined} status
 * @returns {string | null} the line, or null for `recruiting`
 */
export function recruitingStatusLine(status) {
  switch (status) {
    case "recruiting":
      return null;
    case "active_not_recruiting":
      return "This trial is not accepting new participants right now.";
    case "completed":
      return "This trial has finished enrolling.";
    case "not_yet_recruiting":
      return "This trial is not yet open to participants.";
    default:
      return "This trial is not confirmed open to new participants.";
  }
}
```

Add the named export beside the other handler exports in `index.js`:

```js
export { recruitingStatusLine } from "./recruiting-status.js";
```

Verification: `bun test products/polaris/handlers/test/recruiting-status.test.js`
(added in Step 6) passes.

## Step 2: Read `status` in the handler and attach the line

After the fit result is built and before the `base` assembly, read the trial's
`status` and attach the resolved line, using the module's existing `eq` binding
and `rows[0] ?? …` idiom; leave the invalid-age early return untouched (it
produces no result, so it carries no line — design boundary).

- **Modified:** `products/polaris/handlers/src/check-eligibility.js`

```js
import { recruitingStatusLine } from "./recruiting-status.js";
// ...
// After conditionsById is built and before buildPreCheck / the return:
const trialRows =
  (await db.get(`trials?id=${eq}&select=status`)) ?? [];
const recruitingStatus = recruitingStatusLine(trialRows[0]?.status);
// ...
const base = { ...viewModel, match_score, reasons, recruitingStatus };
```

Verification: the handler cases in Step 7 pass; `git diff` shows no change under
`services/polaris-functions/eligibility-check/` (C4).

## Step 3: Render the recruiting-status section in the CLI template

Add a truthiness-guarded section that renders the line beside the fit outcome.
Place it directly after `{{summary}}` (the outcome summary) so a non-recruiting
result never renders without the not-open context (S1). Use the scalar-guard
idiom the template already proves with `{{#signal_id}}`.

- **Modified:** `products/polaris/handlers/templates/check-eligibility.md`

```mustache
{{summary}}

{{#recruitingStatus}}
**{{recruitingStatus}}**
{{/recruitingStatus}}
```

(A `recruiting` trial resolves `recruitingStatus` to `null`, so the section is
omitted and the render is unchanged — C3.)

Verification: `bun test products/polaris/handlers/test/templates.test.js` and the
Step 7 end-to-end assertion via `just cli eligibility diabetes-prevention`.

## Step 4: Declare the new export in the site type stub

The site does **not** pick up the resolver's type from its JSDoc. It types
`@bionova/polaris-handlers` through a hand-maintained ambient stub that
enumerates the package's exports; TypeScript resolves the bare specifier to that
stub, not the JS. So Step 5's page import fails `tsc --noEmit` with `TS2305`
until the new symbol is declared there. (Measured on-branch — see the execution
note.)

- **Modified:** `products/polaris/site/src/types/modules.d.ts`

Add to the `declare module "@bionova/polaris-handlers"` block, beside the eight
handler declarations:

```ts
export function recruitingStatusLine(
  status: string | null | undefined,
): string | null;
```

Verification: `cd products/polaris/site && npx tsc --noEmit` exits 0 (it exits 2
with `TS2305` if this step is skipped).

## Step 5: Render the line on the web screener result

Carry `status` on the page's `showTrial` return type and render the resolved
line beside the unchanged `MatchScoreBadge` when a score is present. No new read
— `showTrial` already selects `status`.

- **Modified:** `products/polaris/site/src/app/trials/[id]/eligibility/page.tsx`

```tsx
import { showTrial, recruitingStatusLine } from "@bionova/polaris-handlers";
// ...
const result = (await showTrial(ctx)) as {
  trial: { name?: string; status?: string | null } | null;
  criteria: Criteria;
};
// ...
{score ? (
  <div className="flex flex-col gap-2 rounded-md border border-border p-3">
    <div className="flex items-center gap-2">
      <span className="text-sm">Your result:</span>
      <MatchScoreBadge score={score} />
    </div>
    {recruitingStatusLine(result.trial?.status) ? (
      <p className="text-sm">{recruitingStatusLine(result.trial?.status)}</p>
    ) : null}
  </div>
) : null}
```

Verification: the site case in Step 8 passes; the `MatchScoreBadge` markup is
unchanged (C6).

## Step 6: Resolver unit test

Cover every value-to-line mapping and the fail-safe branches, with `status` as
the only input (C7).

- **Created:** `products/polaris/handlers/test/recruiting-status.test.js`

Assertions:

- `recruitingStatusLine("recruiting")` is `null`.
- Each of the three named values returns its own line, and the three differ (C2).
- An unlisted value (`"suspended"`), `null`, and `undefined` each return the
  fail-safe line (fail-safe, #298).
- No return value contains a raw underscored identifier (`active_not_recruiting`,
  `not_yet_recruiting`, `completed`) (C5).
- Every input is a bare `status` string — no trial id or name is passed (C7).

Verification: `bun test products/polaris/handlers/test/recruiting-status.test.js`.

## Step 7: Handler tests

Add the new `trials` route to the existing check-eligibility route tables, then
add the recruiting-status cases.

- **Modified:** `products/polaris/handlers/test/check-eligibility.test.js`

Route-table update (all cases that reach the status read): add
`route("trials?id=", [{ status: "recruiting" }])` (or the case's status) to each
`makeFetch([...])` table. Without it the new `db.get` rejects with "No fake
route".

New cases:

| Case | Setup | Asserts |
| --- | --- | --- |
| C1 | `trials` route → `active_not_recruiting` | result carries both the fit outcome (`match_score`/`summary`) and `recruitingStatus` = the not-accepting line |
| C2 | three runs, `trials` → each named state | each run's `recruitingStatus` names its own state and the three strings differ |
| C3 | `trials` route → `recruiting` | `recruitingStatus` is `null` |
| C4 | fixed answer set, before/after this change | `match_score` and `reasons` match the pre-existing "returns the score…" case values; assert no fixture change under `services/polaris-functions/eligibility-check/` |
| C5 | any non-recruiting run | `recruitingStatus` contains none of the raw underscored identifiers |

Verification: `bun test products/polaris/handlers/test/check-eligibility.test.js`.

## Step 8: Site result test

Add a case to the existing eligibility page test.

- **Modified:** `products/polaris/site/src/__tests__/eligibility.test.tsx`

**First, the mock contract (load-bearing — measured on-branch).** The page now
imports `recruitingStatusLine` from `@bionova/polaris-handlers`, and the test's
`vi.mock` factory replaces the *whole* module — so the existing
`() => ({ showTrial, checkEligibility })` factory leaves `recruitingStatusLine`
undefined and the page throws `No "recruitingStatusLine" export is defined on the
mock` at render. This breaks not only the new cases but the *existing*
score-badge case. Convert the factory to keep the real resolver (a pure
presentation function whose actual text C2/C6 must exercise) while stubbing only
the two data handlers:

```ts
vi.mock("@bionova/polaris-handlers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bionova/polaris-handlers")>();
  return { ...actual, showTrial: vi.fn(), checkEligibility: vi.fn() };
});
```

(`importOriginal` loads the real package index in vitest without pulling in a
broken graph — verified on-branch. A re-implemented double is rejected: it would
let the web-surface text drift from the resolver, the exact trap the shared
resolver exists to prevent.)

Assertions, using the `showTrial` mock + score-in-query pattern:

- `showTrial` mock returns `trial: { name, status: "active_not_recruiting" }`
  **plus a `criteria` object** (`{ inclusion: { custom: [] }, exclusion: { custom: [] } }`
  — the page passes `result.criteria` into `EligibilityScreener`, which
  dereferences `criteria.inclusion?.custom`, so an absent `criteria` throws at
  render; match the existing score-badge case's mock), `searchParams` carries a
  `score`: the rendered result shows the not-accepting line beside the
  `MatchScoreBadge`, and the badge renders as in the existing score case (C6).
- `showTrial` mock returns `status: "recruiting"` (with the same `criteria`
  stub), score present: none of the non-recruiting lines appear.

Verification: `npx vitest run src/__tests__/eligibility.test.tsx` (from
`products/polaris/site/`).

## Risks

| Risk | Mitigation |
| --- | --- |
| The net-new `trials?…&select=status` read makes `makeFetch` reject for any existing check-eligibility test whose route table omits a `trials` route — a silent "No fake route" failure the design does not surface. | Step 7 adds the route to **every** existing case that reaches the read, not only the new cases. |
| Spec S3's literal wording ("recruiting — or any value other than the three non-recruiting states — … adding no status text") reads as silence for a *future* value, which the design deliberately narrows to `recruiting` alone. Shipped behavior and spec text disagree until S3 is tightened. | This is a **pre-merge spec edit owned by whoever holds PR #304** (staff does not author specs) — flagged in the design's "reconcile in the spec" note, not planned around here. If the approver keeps S3's literal closed-enum instead, the design returns to draft and this plan is revised; the resolver's `default` branch is the single line to change. |
| The web page calls `recruitingStatusLine` twice (guard + render). | Cosmetic only; a `const line = recruitingStatusLine(result.trial?.status)` hoist is an equally valid implementer choice — behavior is identical. Left to the implementer. |
| **Module-mock boundary (execution-verified, exp #318 + #319):** Step 5 adds `recruitingStatusLine` to the page's imports, but the site test mocks the whole `@bionova/polaris-handlers` module — so the new export is `undefined` at the call site unless the mock factory is updated, failing the existing score-badge case as well as the new ones. A paper panel does not see this because it reads the step list, not the mock's returned key set. Note: vitest strips types, so this is the *runtime* half; the *type* half (the stub, Step 4) needs `tsc` — a check the plan's named verifications did not include until now. | Step 8 updates the `vi.mock` factory first, returning the real resolver via `importOriginal`. Verified green on-branch. |

## Execution recommendation

Single engineering agent, sequential: Steps 1→5 are a straight dependency chain
(resolver → handler → template → site type stub → web page — the stub precedes
the page so the page typechecks), and Steps 6→8 verify each surface as it lands.
No parallelism benefit — the whole change is a few hundred lines across one
package boundary. Route to `kata-implement` on a `feat/280-recruiting-status-in-screener`
branch once the design is approved and merged.

## Execution verification (pre-flight, exp #318)

This plan was applied to a throwaway working tree off the branch and its own
named verifications were run — the pre-flight is execution-verified, not only
panel-clean. Measured 2026-08-03:

- `bun test products/polaris/handlers/test/` — **54 pass / 0 fail** (12 files).
- `cd products/polaris/site && npx tsc --noEmit` — **exit 0** (1.9s). Skipping
  Step 4 reproduces `TS2305` at exit 2.
- `cd products/polaris/site && bun run test` (full vitest) — **14 pass / 0 fail**.

Two defects surfaced that the paper `kata-plan` panel could not see; both are
now folded in above (they do not change the design's shape — one shared resolver
exported from the package, imported by both surfaces):

1. **Site type stub (Step 4).** The design assumed the site typed the resolver
   from its JSDoc; it types the package through the ambient stub
   `modules.d.ts`, so the import fails `TS2305` until the export is declared
   there. Added as an explicit step.
2. **Site-test mock contract (Step 8).** The page's new import breaks the
   whole-module `vi.mock` factory — including the existing badge case — until
   the factory keeps the real resolver via `importOriginal`. Folded into Step 8.
   Independently co-discovered by exp #319 (`c12678a`); the two runs converged
   on the same `importOriginal` fix. #319 ran only the plan's named
   verifications (vitest, which strips types) and so caught this runtime defect
   but not defect 1 — the type-only stub gap `tsc` exposes. Adding `tsc
   --noEmit` as a named verification (Step 4) closes that blind spot.

The throwaway tree was discarded; only this plan and the design carry forward.
Held at `spec draft` (PR #304): no PR, no merge, no ledger write — this touches
no human-gated state and gate-merges only after human `spec approved`.

— Staff Engineer 🛠️
