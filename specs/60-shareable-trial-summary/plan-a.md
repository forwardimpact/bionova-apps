> **⚠️ PRE-FLIGHT — DO NOT MERGE. Blocked on the full approval chain below.**
> Staged under experiment [#233](https://github.com/forwardimpact/bionova-apps/issues/233)
> against the already-merged [`design-a.md`](./design-a.md). Carries **no** ledger
> write. It must not land until the gate's full precondition chain completes, in
> order: `60 spec draft → spec approved` (human) → `design draft → design
> approved` (human) → `plan draft → plan approved` (staff, after a clean
> `kata-plan` panel) → plan-a lands through `kata-release-merge`.
> Kept as a **branch with no PR** — the gate owner's strictly-safer default for
> pure pre-flight, because an open draft PR is the exact surface where an
> off-gate admin-merge (#64/#68) slipped past a well-meaning human. If a draft PR
> is ever opened for CI/visibility, this banner MUST travel on its body.
>
> **⚠️ DOUBLY SPECULATIVE LEG.** Spec 60's row sits at `spec draft` — not even
> `spec approved` — and its `design-a.md` was **admin-merged** (PR #172), not
> gate-approved. Whether an admin merge counts as design approval is the **open
> governance principle** under exp [#98/#101](https://github.com/forwardimpact/bionova-apps/issues/98)
> (improvement-coach-owned; strict-hold frozen 2026-07-07). **This staged plan
> implies neither spec nor design approval.** The binding valve is the human-only
> `enforce_admins` + code-owner flip (#196b, in-tree line PR #201, `b1f38d6`).
> When 60 clears the forced path, if the gate review reworks the design, **discard
> this plan and re-author** — the cost is one thrown-away draft (exp #233's stated
> bound).

# Plan 60 — Shareable plain-language trial summary

## Approach

Add one surface-agnostic handler `summarizeTrial` that reuses `show-trial`'s
query topology but **narrows the `trials` `select` to `id,name,status`** so the
C1-forbidden sponsor/operations columns never enter the process, and copies only
the two age fields off the one row PostgREST cannot sub-select (`criteria`).
Render its patient DTO on two surfaces — a `trial-summary.md` CLI template and a
new `/trials/[id]/summary` route (escaped JSX, no HTML sink) with a copy-link
affordance — and prove C1–C5 with handler-tier `bun` tests against a stubbed
PostgREST. All additive: `show-trial` (handler, template, route, `trial`
command) is untouched (X4). WHAT/WHY in [`spec.md`](./spec.md); WHICH/WHERE in
[`design-a.md`](./design-a.md).

## Invariants (source: design-a + MEMORY design-inputs)

- **The projection is the whole design (design-a § The projection).** The DTO is
  the single load-bearing decision. Build it by a **dedicated narrowed-read
  handler**, never by reusing `showTrial` and deleting fields. The boundary is
  two-tier: a data-layer allowlist for the trial's own columns
  (`select=id,name,status`), and one **build-time selection** for the `criteria`
  row PostgREST bundles whole.
- **`criteria` is the one blocklist site.** `show-trial` reads
  `criteria?...&select=inclusion,exclusion`; each half is a whole JSON object
  (`inclusion` = `{age_min, age_max, conditions_required, ecog_max, custom[]}`,
  `exclusion` = its own `custom[]`). Both arrive whole. The DTO copies **only**
  `inclusion.age_min` / `inclusion.age_max` and drops `ecog_max` and both
  `custom[]`. This is exactly where the C2 test earns its keep.
- **No `buildPreCheck` call (design-a § Field derivations).** The eligibility
  band is a **static projection** of the trial's own age range + required
  condition name — no patient input, no `scoreResult`. Reuse only the *wording
  conventions* of `eligibility-view.js` (age phrased as a range; condition named
  from the catalog row), share **no code path**. Do not import `buildPreCheck`;
  do not invent an empty score.
- **`custom[]` framing (MEMORY spec-70 design-input).** `custom[]` is already
  PUBLIC to patients verbatim on `show-trial`; spec 60 omits it for **legibility,
  not secrecy**. This is a read-only projection boundary, not authz — do not
  frame it as privilege escalation.
- **Escaped rendering, no HTML sink (design-a § Security).** Site route renders
  `consentSummary`/`faq` as escaped JSX text nodes with `whitespace-pre-line`,
  the existing `trials/[id]/page.tsx` pattern. **Never** a markdown/HTML renderer,
  **never** `dangerouslySetInnerHTML` — that sink is the only realistic late XSS
  on this path. CLI renders through the terminal formatter (no browser sink).
  Spec 90's CSP (PR #87) is complementary and non-blocking; add no inline
  `<script>`/`<style>`.
- **Chrome vs. domain content (X3/C5).** `notARecommendation` and `nextStep` are
  fixed **module-private constants** in the summary module, following
  `eligibility-view.js`'s own private `DISCLAIMER`/`NEXT_STEP` convention (not a
  shared import). They are surface framing, not stored domain prose.
- **No new stored content (C5).** Compose only existing
  trial/consent/faq/criteria/condition/site fields. The C5 `rg` guard over
  `products/` (excluding `data/synthetic/` and test fixtures) must find no
  `oncora-phase3` consent/FAQ/`custom[]` string hard-coded in source.
- **Delivery out of scope (X1).** The stable URL *is* the shareable artifact; the
  copy-link affordance copies that URL and sends nothing. No email/SMS/print/QR.
- **Watcher-safe.** `plan-a.md` is not read by
  `scripts/spec-design-watcher.js`; staging it moves no gauge.

## Steps

### Step 1 — `summarizeTrial` handler (the narrowed-read projection)

- New file: `products/polaris/handlers/src/summarize-trial.js`
- Modified: `products/polaris/handlers/src/index.js` (add
  `export { summarizeTrial } from "./summarize-trial.js";`)

Signature matches every read handler: `async (ctx) => data`, with
`ctx = { data: { db }, args: { id } }`. Reuse `show-trial`'s query topology
verbatim **except** the `trials` select:

- `trials?id=eq.${enc}&select=id,name,status` — **only** these three columns, so
  `protocol_id`, `sponsor`, `therapeutic_area`, `target_enrollment`,
  `current_enrollment` are **never fetched**.
- `trial_sites?...&select=sites(id,name,city,state)` — cities for `siteCities[]`.
- `trial_conditions?...&select=conditions(id,name)` — for the study description
  and the eligibility band's condition name.
- `criteria?...&select=inclusion,exclusion` — read whole (unavoidable), copy
  **only** `inclusion.age_min`/`inclusion.age_max`.
- `consent_summaries?...&select=summary` and `trial_faqs?...&select=faq` — prose
  body, verbatim.

Build and return the DTO from design-a § The projection:

```
{ name, studyDescription, openStatus, siteCities[],
  eligibility: { ageMin, ageMax, conditionName },
  consentSummary, faq, notARecommendation, nextStep }
```

Field rules (design-a § Field derivations):
- `studyDescription` — composed from `conditions[].name` + consent-summary prose;
  **never** `therapeutic_area`. No rewrite (X3): the disease name reaches output
  through the catalog name and the consent prose as-is.
- `openStatus` — `trials.status === "recruiting"` → open-to-new-patients phrasing;
  any other status → not-currently-open. **Never** derived from enrollment counts.
- `eligibility` — static: `{ ageMin: inclusion.age_min, ageMax: inclusion.age_max,
  conditionName: conditions[0]?.name }`. No patient input.
- `notARecommendation` / `nextStep` — module-private constants.

Verify: `summarizeTrial` returns the DTO shape; the DTO object carries no
`protocol_id`/`sponsor`/`therapeutic_area`/enrollment key, no `ecog_max`, and no
`custom` array (asserted by the Step 6 tests).

### Step 2 — `trial-summary.md` template

- New file: `products/polaris/handlers/templates/trial-summary.md`

Render the DTO for the terminal surface, mirroring `show-trial.md`'s template
idiom. Sections: name; study description; open-status line; site cities; the
plain-language eligibility band (age range + condition, phrased per
`eligibility-view.js` wording conventions); consent summary; FAQ; the
`notARecommendation` statement; the `nextStep` line. No sponsor/operations
fields, no `custom[]`, no `ECOG` line.

Verify: the rendered CLI output reproduces the DTO fields and none of the C1/C2
forbidden strings.

### Step 3 — `summary <id>` CLI command

- Modified: `products/polaris/cli/src/definition.js`

Add a command mirroring `trial` (`definition.js:60-64`), `--json` parity like
every read command (the global `--json` flag already applies via `respond`):

```js
{
  name: "summary",
  description: "Show a shareable plain-language summary for a single trial.",
  args: ["id"],
  handler: async (ctx) =>
    respond("summarize-trial", ctx, await handlers.summarizeTrial(ctx)),
},
```

Register `trial-summary.md` wherever `respond` resolves template names to files
(same registration path `show-trial.md` uses). `show-trial`'s `trial` command is
**untouched** (X4).

Verify: `just cli summary oncora-phase3` renders the summary; `--json` emits the
DTO; `just cli trial oncora-phase3` output is unchanged.

### Step 4 — Summary route (escaped JSX + copy-link)

- New file: `products/polaris/site/src/app/trials/[id]/summary/page.tsx`

Follow `trials/[id]/page.tsx` (`:8-19`): `export const dynamic =
"force-dynamic";` (preserve the caching posture — spec 50 invariant), async
component, `const { id } = await params;` (Next 15 async params, already on main
via spec 50), `const ctx = buildCtx({}, { id });`, `await summarizeTrial(ctx)`.
Render `consentSummary`/`faq` inside **escaped JSX text nodes** with
`whitespace-pre-line`. A copy-link affordance (client component) copies
`window.location.href` and sends nothing. Trial-not-found → the same guard
`trials/[id]/page.tsx` uses.

Verify: `next build` type-checks; the route renders escaped text with no
`dangerouslySetInnerHTML`; copy-link copies the URL only.

### Step 5 — (folded into Step 4) copy-link client affordance

If the copy-link needs `"use client"`, keep it a **leaf** component imported by
the server route; the route itself stays a server component that calls the
handler. No handler or DTO change.

### Step 6 — Handler tests C1–C5

- New file: `products/polaris/handlers/test/summarize-trial.test.js`

Handler-tier `bun` tests against a **stubbed PostgREST** (reuse `test/helpers.js`
+ `test/fixtures`), exercising the seeded `oncora-phase3`. **No FIT_TERRAIN, seed,
or smoke run needed** — assertions read the DTO / rendered template directly.

- **C1** — rendered summary contains the trial name; a non-empty study
  description naming the condition in patient terms (lung cancer, from the
  catalog name / consent prose — **not** `oncology`); site cities; an
  open/recruiting phrase. Absent: `BNV-ONC-2024-301`, `BioNova Therapeutics`,
  `287 / 450`, and any therapeutic-area line.
- **C2** — plain age band (18–75) + plain condition; **no** `custom[]` string
  (inclusion or exclusion, e.g. "Measurable disease per RECIST 1.1"); **no**
  `ECOG` line.
- **C3** — consent-summary prose and FAQ prose present.
- **C4** — next-step line + not-a-recommendation statement present.
- **C5** — DTO built only from existing fields, no new stored field; `rg` over
  `products/` (excluding `data/synthetic/` and fixtures) finds no seeded
  consent/FAQ/`custom[]` string hard-coded in source.

Verify: `cd products/polaris/handlers && bun test summarize-trial` — all C1–C5
pass.

### Step 7 — Full gate pass

- No file changes.

Verify: `just lint` clean (eslint + deno); `just test` green (handler suite
including the new C1–C5); `just smoke` returns 200 on the new
`/trials/[id]/summary` route alongside the existing routes; `next build`
type-checks the new route and emits `server.js` unchanged. `bun audit` unchanged
(no dependency added).

Libraries used: none (new handler + template + route + CLI command; no new
dependency).

## Risks

| Risk | Mitigation |
|---|---|
| Reusing `showTrial` and deleting fields (the rejected alternative) re-enters every sponsor column into the process; a forgotten `delete` leaks it. | Step 1 builds a **dedicated** handler with `select=id,name,status`; the C1-forbidden columns are never fetched. Design-a § The projection is the binding decision. |
| The `criteria` row bundles `ecog_max` and both `custom[]` into the process whole — a copy-more-than-two-fields regression leaks protocol strings. | Step 1 copies only `age_min`/`age_max`; the C2 test (Step 6) asserts no `custom[]` string and no `ECOG` line in rendered output — a regression fails a test, not ships. |
| A future maintainer wires the site route through a markdown/HTML renderer or `dangerouslySetInnerHTML`, opening late XSS on generator-emitted `<`/`>`. | Step 4 fixes escaped JSX text nodes + `whitespace-pre-line`, the existing `trials/[id]/page.tsx` pattern; the plan forbids the sink explicitly. |
| The eligibility band drifts toward calling `buildPreCheck` for "consistency," dragging in ECOG/custom bucketing this view must not show. | Step 1 builds a static band from the trial's own age range + condition; design-a § Field derivations rejects the `buildPreCheck` path outright. No shared code path. |
| **Governance (the load-bearing risk):** the design was admin-merged (#172), not gate-approved, and spec 60 is `spec draft`. If the forced-path review reworks the design, this plan mis-collapses. | Draft-only, no ledger write, no admin-merge (honors #98/#101 strict-hold). Discard-and-re-author on any design change — bounded to one thrown-away draft (exp #233). The design already survived a 3-agent kata-review panel that caught a Blocker (#168), so it is fairly settled. |
| Spec 10's eligibility layer and this band could derive two different wordings on the same surface. | Spec 60 § Scope: where spec 10 is live, align wording rather than derive a second; reuse `eligibility-view.js` conventions. Related, not blocking. |

## Execution

Single unit, sequential — no decomposition. One PR carries all steps (additive,
no atomic-removal constraint). Route to an engineering agent via `kata-implement`
**only once spec 60 reaches `plan approved`** through the forced path. Clean
break: a new parallel view; no mode/flag added to `show-trial` (X4).

— Staff Engineer 🛠️
