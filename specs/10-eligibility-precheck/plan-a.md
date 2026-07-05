# Plan 10-a: Plain-language eligibility pre-check

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add one pure builder, `buildPreCheck`, that classifies the edge function's flat
`reasons` grammar into a plain-language view model, and wire `checkEligibility`
to call it after a `criteria` read and a condition-slug resolution read. The
edge function and the `interest_signals` insert body are untouched; the CLI
template is rewritten to render the view model. Everything lands at the handler
layer, so the `eligibility` CLI command and any future surface inherit it.

Libraries used: libtemplate (renders the rewritten CLI template at the surface;
`createTemplateLoader` is driven directly in the template tests). No new import
in production handler code.

## Step 1 — Add the pure builder `buildPreCheck`

Create the classifier + slug-resolution rule as a pure function.

- **Created:** `products/polaris/handlers/src/eligibility-view.js`

Signature: `buildPreCheck(criteria, scoreResult, conditionsById) → viewModel`.

- `criteria` — `{ inclusion, exclusion }` (the row shape from
  `criteria?...&select=inclusion,exclusion`); tolerate `null` halves.
- `scoreResult` — `{ match_score, reasons }` from the edge function.
- `conditionsById` — object keyed by resolved condition **id** (hyphenated,
  e.g. `lung-cancer`) → `{ id, name }`.

Classify each entry of `reasons` by **exact prefix** against the pinned grammar
(design § "The two substrates", table 1). Render each into plain language:

| Reason literal (prefix)            | Bucket        | Rendered line |
| ---------------------------------- | ------------- | ------------- |
| `Age N within [min, max]`          | `supports`    | `Your age (N) is within this trial's range of min to max.` |
| `Age N outside [min, max]`         | `against`     | `This trial enrolls ages min to max; the age you gave (N) is outside that range.` |
| `Age not provided`                 | `unclear`     | `This trial has an age range. Add your age to check whether you fall inside it.` |
| `ECOG N <= M`                      | `supports`    | `Your reported ability to handle daily activities meets this trial's requirement.` |
| `ECOG N exceeds max M`             | `against`     | `This trial asks for a level of day-to-day physical ability above what you reported.` |
| `ECOG not provided`                | `unclear`     | `This trial has a physical-ability (performance status) requirement a coordinator can help you gauge.` |
| `Has required condition: S`        | `supports`    | `You reported {name}, which this trial requires.` |
| `Missing required condition: S`    | `against`     | `This trial requires {name}, which you did not report.` |
| `Required conditions not provided` | `unclear`     | `This trial requires one or more specific conditions. Add your conditions to check.` |
| `Excluded condition: S`            | `against`     | `This trial cannot enroll people with {name}, which you reported.` |
| `Meets:` / `Does not meet:` / `Unanswered:` / `Excluded:` `<custom>` | *(dropped)* | never bucketed — see coordinator-questions |

**Value extraction (pin the parse).** Patient values live only in the reason
string, not in `criteria`, so the builder parses the literals with anchored
regexes and throws (fail-loud) on no match:

- `/^Age (\d+) (within|outside) \[(\d+), (\d+)\]$/` → `N`, direction, `min`,
  `max`.
- ECOG lines carry **no numerals** in the rendered copy (below), so ECOG
  reasons match by prefix only (`ECOG …<= `, `ECOG … exceeds max `,
  `ECOG not provided`) — no number is extracted or shown.
- Condition reasons: the slug `S` is the substring after the first `": "`.

Slug resolution rule (design § key decisions): normalize `S` `_`→`-`, look up
`conditionsById`. **Resolves** → render with `{name}` in the bucket above.
**Unresolvable** → do not bucket and do not emit a label; append to
`coordinatorQuestions` as `A condition this trial states in clinical terms —
confirm this one with the coordinator.`

`coordinatorQuestions[]` is, in order: every `criteria.inclusion.custom[]` then
`criteria.exclusion.custom[]` string **verbatim**, then any unresolvable-slug
line from above. The scorer's four `<custom>` reasons are recognized and
dropped (their weight is already in `match_score`).

`summary` — fixed map, no enum token (C3):

| `match_score`       | `summary` |
| ------------------- | --------- |
| `eligible`          | `Based on what you shared, you likely meet this trial's main requirements.` |
| `possibly_eligible` | `Based on what you shared, you may fit this trial, but some requirements could not be checked.` |
| `not_eligible`      | `Based on what you shared, you likely do not fit one or more of this trial's requirements.` |

`disclaimer` (fixed): `This is a self-assessment, not a medical decision or a
determination of eligibility.` `nextStep` (fixed): `To find out if you qualify,
contact the trial coordinator.`

C1 rationale: the design restates the spec's "plain-language questions" as a
"plain-language self-assessment prompt". So a structured rule the patient has
already answered renders as a plain-language statement of how it bears on fit
(`supports`/`against`), and one the patient has **not** answered renders in
`unclear` as an answerable prompt. Both forms are "plain language a patient can
act on" rather than the raw label-value line; B1/B2 assert the affirmative form
in each state.

Return `{ summary, supports, against, unclear, coordinatorQuestions, disclaimer,
nextStep }`.

**Fail loudly:** a `reasons` entry matching **none** of the prefixes above
throws `Error("Unrecognized eligibility reason: <entry>")`, so a scorer grammar
drift is caught by a test rather than silently mis-bucketed.

Prefix trap to pin: treat `Required conditions not provided` (plural →
`unclear`) as distinct from `Missing required condition:` (singular →
`against`). (`Excluded:` and `Excluded condition:` do not collide under
`startsWith` — the char after `Excluded` is `:` vs ` ` — but match
`Excluded condition:` first anyway so the intent is explicit.)

*Verify:* Step 4 builder tests pass.

## Step 2 — Wire `checkEligibility` to the builder

Extend the handler to read criteria, resolve slugs, and return the view model.

- **Modified:** `products/polaris/handlers/src/check-eligibility.js`

After the edge-function invoke (unchanged) and before the insert:

```js
// Read the trial's criteria (same shape show-trial.js proves).
const eq = `eq.${encodeURIComponent(id)}`;
const criteriaRows =
  (await db.get(`criteria?trial_id=${eq}&select=inclusion,exclusion`)) ?? [];
const criteria = criteriaRows[0] ?? { inclusion: null, exclusion: null };

// Resolve required + excluded condition slugs (_ -> -) to catalog names.
const slugIds = [
  ...(criteria.inclusion?.conditions_required ?? []),
  ...(criteria.exclusion?.conditions_excluded ?? []),
].map((s) => s.replaceAll("_", "-"));
let conditionsById = {};
if (slugIds.length > 0) {
  // Quote each id — the proven in.(...) idiom (search-trials.js:110,132).
  const inList = [...new Set(slugIds)].map((c) => `"${c}"`).join(",");
  const rows = (await db.get(`conditions?id=in.(${inList})&select=id,name`)) ?? [];
  conditionsById = Object.fromEntries(rows.map((r) => [r.id, r]));
}

const viewModel = buildPreCheck(criteria, { match_score, reasons }, conditionsById);
```

Insert stays byte-for-byte `{ trial_id: id, screener_answers: answers,
match_score }` (C5). Return spreads the view model but **keeps** `match_score`
and `reasons` (the web screener reads `result.match_score` at X6; the existing
handler test reads both), and preserves the conditional `signal_id`:

```js
const base = { ...viewModel, match_score, reasons };
return signal_id !== undefined ? { ...base, signal_id } : base;
```

Import `buildPreCheck` from `./eligibility-view.js`.

*Verify:* Step 4 handler test passes; `match_score`/`reasons`/`signal_id`
behavior unchanged.

## Step 3 — Rewrite the CLI template

Replace the enum-plus-`reasons` render with the view model (clean break, no
wrapper).

- **Modified:** `products/polaris/handlers/templates/check-eligibility.md`

```markdown
# Eligibility pre-check

{{summary}}

{{#supports.length}}
## Where you likely fit
{{#supports}}- {{.}}
{{/supports}}
{{/supports.length}}

{{#against.length}}
## Where you likely do not fit
{{#against}}- {{.}}
{{/against}}
{{/against.length}}

{{#unclear.length}}
## Could not check from your answers
{{#unclear}}- {{.}}
{{/unclear}}
{{/unclear.length}}

{{#coordinatorQuestions.length}}
## Questions to confirm with the coordinator
{{#coordinatorQuestions}}- {{.}}
{{/coordinatorQuestions}}
{{/coordinatorQuestions.length}}

_{{disclaimer}}_

**{{nextStep}}**

{{#signal_id}}
_Your anonymous interest has been recorded (ref {{signal_id}})._
{{/signal_id}}
```

No `{{match_score}}`, no `Age:` / `ECOG max:` label-value lines. libtemplate is
Mustache-based and renders `{{#supports.length}}` against the array's numeric
`length` (truthy when non-empty, so the heading shows only when the bucket has
items). Use the `.length` guard as written — do **not** gate the heading on the
plain `{{#supports}}` list section, which would repeat the heading once per
item. Step 4 pins this by asserting an empty bucket omits its heading.

*Verify:* Step 4 template tests pass.

## Step 4 — Tests

Add builder coverage, update the handler test for the new reads and return
shape, and rewrite the template case.

- **Created:** `products/polaris/handlers/test/eligibility-view.test.js`
- **Modified:** `products/polaris/handlers/test/check-eligibility.test.js`
- **Modified:** `products/polaris/handlers/test/templates.test.js`

Builder tests (`eligibility-view.test.js`), importing `buildPreCheck` from
`../src/eligibility-view.js`, anchored on `oncora-phase3` criteria:

| # | Assertion |
| - | --------- |
| B1 | `Age 55 within [18, 75]` → `supports`, rendered as a full plain-language sentence naming the range in words, containing no `Age:` label-value form; and `Age not provided` → `unclear`, rendered as an answerable prompt (contains `Add your age`) — the affirmative half of C1. |
| B2 | `ECOG 2 <= 2` → `supports`; `ECOG 3 exceeds max 2` → `against`; `ECOG not provided` → `unclear`; every ECOG line is a full plain-language sentence, reproduces no `ECOG max:` form, and shows no ECOG numeral (C1). |
| B3 | `Has required condition: lung_cancer` renders `Non-Small Cell Lung Cancer` in `supports` (slug resolved). |
| B4 | `Excluded condition: active_autoimmune_disease` (unresolvable on this seed) appears **only** in `coordinatorQuestions`, never `against` (design substrate 2). |
| B5 | Against-bucket rendering: `Age 80 outside [18, 75]`, `ECOG 3 exceeds max 2`, and `Missing required condition: lung_cancer` each render as a plain-language `against` line naming the resolved condition where applicable (C3). |
| B6 | The four `<custom>` reasons — including a real `Excluded: <exclusion custom>` — never appear in any bucket; with a patient input that emits **no** `Excluded condition:` reason, `coordinatorQuestions` equals `inclusion.custom` then `exclusion.custom` verbatim in order (C2/S2). |
| B7 | `Required conditions not provided` → `unclear`, not `against` (plural/singular trap). |
| B8 | An unknown reason string throws `Unrecognized eligibility reason:`. |
| B9 | `summary` for each `match_score` contains no raw enum token; `disclaimer` + `nextStep` present for all three (C3/C4). |

Handler test (`check-eligibility.test.js`): switch the fake `fetch` to
`makeFetch`/`route` (helpers.js) so it answers the edge-function invoke, the
`criteria?...` GET, and the `conditions?id=in.(...)` GET, plus the
`interest_signals` POST. Keep the existing assertions (insert body exactly
`{trial_id, screener_answers, match_score}`; no `return=representation`;
`match_score`/`reasons` on the return) and add: the return carries `summary`
and the four bucket arrays. Keep the insert-failure test.

Template tests (`templates.test.js`): replace the `check-eligibility.md` entry
in the minimal-shape loop with a view-model shape. Add focused renders:

- **All three outcomes (C3/C4):** render once per `summary` value with the
  disclaimer/nextStep fields set; assert each output carries the `disclaimer`
  and `nextStep` copy and contains no raw enum token (`eligible` /
  `possibly_eligible` / `not_eligible`).
- **Sections (C1/C2):** with a view model carrying a resolved `supports` line,
  an `unclear` ECOG prompt, and a `coordinatorQuestions` entry, assert the
  `custom[]` string renders only under the coordinator-questions heading, the
  **exact** ECOG unclear sentence appears verbatim (pins the design's ECOG
  open question against drift), and no `Age:` / `ECOG max:` label-value line
  appears.
- **Empty bucket:** a view model with an empty `against` array omits the
  "Where you likely do not fit" heading (pins the `.length` guard).

*Verify:* `cd products/polaris/handlers && bun test`.

## Step 5 — End-to-end and guard verification

- **C1 end-to-end:** `just cli eligibility oncora-phase3` renders the pre-check
  (needs a rendered seed + stack; run under `just boot`/`just smoke` where the
  stack is available — otherwise B1–B2 + the template test carry C1).
- **C5 guard:** run
  `rg -F -e 'Histologically confirmed NSCLC' -e 'Measurable disease per RECIST' -e 'Adequate organ function' -e 'Prior anti-PD-1/PD-L1' -e 'Active CNS metastases' products/`
  (the verbatim `oncora-phase3` `custom[]` prose) and confirm **zero** hits —
  the builder and template hold only fixed copy and data-parameterized
  patterns; every criterion string reaches output only from the DB-read
  `criteria.custom[]`, never from committed source under `products/`.

## Risks

- **Cross-runtime grammar coupling.** The handler cannot import the Deno scorer;
  the classifier matches its exact string literals. A scorer wording change
  breaks bucketing silently — mitigated by the fail-loud throw (Step 1) and B8.
- **Prefix collision.** `Required conditions not provided` (plural) and
  `Missing required condition:` (singular) differ only by a word; the wrong
  match mis-buckets. Pinned by B7.
- **Unresolvable-slug path only fires on an emitted condition reason.** On
  `oncora-phase3` the excluded slug produces a reason only when the test patient
  reports it — B4 must construct that input or the fallback goes uncovered.
- **libtemplate `.length` guard.** The heading-visibility logic depends on
  Mustache resolving `{{#supports.length}}` as truthy-when-non-empty; if a
  libtemplate upgrade changed that, headings would render for empty buckets —
  the empty-bucket template test (Step 4) catches it.

## Execution recommendation

One unit, one engineering agent, on `feat/10-eligibility-precheck` via
`kata-implement`. Not decomposed — one new module, one handler edit, one
template, and their tests are tightly coupled and share the `oncora-phase3`
anchor. Steps run in order (1 → 2 → 3 → 4 → 5); Step 5 needs the stack.

— Staff Engineer 🛠️
