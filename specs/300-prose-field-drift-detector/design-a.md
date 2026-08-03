# Design A — Spec 300: Prose-vs-structured-field drift detector

Detects generated patient-facing prose that contradicts the `story.dsl`
structured field it derives from, over the vendored `data/synthetic/` bundle,
and routes each finding upstream to `fit-terrain`. Detect-and-route only — the
gate never edits the vendored bundle. **Operand = the shipped prose:** the
rendered `trial_faqs.faq` row, one per trial per family, not a `prose-cache.json`
key.

## Restatement

- **Problem.** `story.dsl` (structured truth) and the generated FAQ prose are
  reconciled by nothing. A contradiction baked into the bundle — DIABPREV-201's
  shipped FAQ says "looking for about 300 people" while its `status` is
  `active_not_recruiting` at 298/300 — reaches the patient verbatim.
- **Scope.** One in-tree DETECT+ROUTE gate over `data/synthetic/`, rule stated
  once and parameterized by structured field: a shipped prose assertion must not
  contradict the field it derives from; on contradiction, flag and route
  upstream, never edit the bundle. Charter is **trial-FAQ only**.
- **Success (SC1–SC6).** Reports DIABPREV-201's one shipped FAQ row (SC1); clean
  on CARDIO-301 with its actual "currently enrolling" string asserted (SC2);
  never mutates the bundle (SC3); emits a durable routed record naming trial +
  shipped FAQ row + conflicting field (SC4); the criteria family reuses the same
  rule as data, not a second detector (SC5); runs in the `check-seed` CI job so
  future drift fails before merge (SC6).

## The operand ruling (consumed, not re-litigated)

PM ruled both operand questions closed (design-inputs.md#issue-127-299-detector-fold,
2026-08-02); this design consumes them:

- **Q1 — scope.** Trial-FAQ prose ONLY. Condition-explainers
  (`clinical_condition_explainer_<condition>`) are a **declared future
  extension**, deferred: condition-keyed, needing a condition→trial join the spec
  does not define and no SC exercises. Not the current charter.
- **Q2 — operand identity.** The operand is the **rendered value** — the exact
  bytes of the `trial_faqs.faq` row, seeded by the verbatim hyphen `story.dsl`
  trial id — never a `prose-cache.json` key chosen by spelling or `#hash`. The
  gate CANNOT pick the shipped variant from the cache: multiple `#hash` variants
  sit under one hyphen spelling and only the render's prompt-hash lookup selects
  the one that ships (verified: `oncora-phase3` ships `#cfe85995`; `#f59f778e`
  under both `-phase3` and `_phase3` never renders). So the shipped operand is
  read from the **render output**, not reconstructed from the cache.

## Architecture

A single read-only Node gate, `scripts/bundle-consistency-gate.js`, modeled on
the existing `scripts/audit-gate.js` baseline gate. Its two operands are the
rendered FAQ rows (shipped prose) and the `story.dsl` structured fields; it joins
by trial id, applies a field-family rule table, and diffs findings against a
committed routed-findings baseline, failing CI only on findings _not_ baselined.
A separate, clearly-labeled hygiene pass over unreferenced cache keys is distinct
from the SC1–SC6 shipped-prose operand.

```mermaid
flowchart LR
  DSL[data/synthetic/story.dsl] --> FR[readTrials: id -> structured fields]
  SEED[".build .../seed_*_trial_faqs.sql (rendered)"] --> PR[readShippedFaqs: trial_id -> faq]
  FR --> RULE{field-family rule table}
  PR --> RULE
  RULE --> AUD["audit = {findings, parseErrors}"]
  BASE[scripts/bundle-drift-baseline.json] --> DIFF
  AUD --> DIFF{diff vs drift baseline}
  DIFF -->|unbaselined finding / parseError| FAIL[exit 1 + ::error::]
  DIFF -->|all baselined; overdue + stale warned| PASS[exit 0 + report]
  PC[data/synthetic/prose-cache.json] -.-> HYG[/"cache-hygiene pass (SEPARATE, not-SC1–SC6)"/]
```

## Components

| Component | Responsibility | Interface |
| --- | --- | --- |
| `readTrials(storySrc)` | Scoped brace-depth reader over `story.dsl`: per `trial <id> { … }`, extract declared structured fields (`status`, nested `criteria`). Not a general DSL parser — reads exactly the fields the rules need. | `→ { trials: {id: {status, criteria, …}}, parseErrors: [] }` |
| `readShippedFaqs(seedSrc)` | Scoped reader over the rendered `seed_*_trial_faqs.sql` that `build-seed.sh` produces (`data/synthetic/.build/.../migrations/`, gitignored render output — NOT the vendored source). Extract each `(trial_id, faq)` INSERT row — the exact bytes a patient reads. One shipped row per trial per family; no cache key, `#hash`, or spelling ever enters the operand. | `→ { rows: [{trialId, faq}], parseErrors: [] }` |
| Field-family rule table | Data, not code paths. Each family declares the structured `field` it reads and `contradicts(faqText, value) → null \| {reason, excerpt}`. Adding a family adds a row, never a pipeline. | `FAMILIES: Family[]` |
| `runAudit(trials, faqRows)` | Join each shipped FAQ row to its trial by `trial_id` (exact — the seed row already carries the resolved id; no spelling normalization). Run every family; collect findings. A row whose `trial_id` matches no `story.dsl` trial is a `parseError` (fail-closed), never a silent drop. | `→ {findings, parseErrors}` |
| `diffLedger(audit, baseline)` | Set-diff findings against the drift baseline by key. Partition into `unbaselined` (fail), `overdue` (baselined, `review_by` past — warn), `stale` (baselined finding no longer reproducing — warn, flag for removal). The accepted set neither masks new drift nor accretes dead entries. | `→ {unbaselined, overdue, stale}` |
| Routed-findings drift baseline | Committed `scripts/bundle-drift-baseline.json` — the durable SC4 record, outside the vendored `data/synthetic/` tree (human-owned, never vendored). Each entry names trial, shipped FAQ row identity (`trial:field`), field, `structuredValue`, and the upstream route (`fit-terrain` ref + optional `review_by`). Ships baselined: the **one** DIABPREV-201 status finding (routed). A new finding absent from the baseline fails CI. The committed JSON is canonical; slugs named here are illustrative. | JSON, human-edited only |
| Cache-hygiene pass (SEPARATE) | Optional, clearly-labeled, **explicitly not-SC1–SC6**: scans `prose-cache.json` `clinical_trial_faq_` keys that render ZERO rows (spelling aliases, non-shipped `#hash` variants, orphan slugs `diabex_p2`/`lungshield_p1`/`neuregen_p2`/`oncora_p3`). A newly-unreferenced key fails CI as **cache hygiene**, reported under its own label with its own `scripts/bundle-cache-hygiene.json` accepted-set. Never mixed into the shipped-prose drift ledger. | `→ {newlyUnreferenced}` |
| CI step | New step in `check-seed.yml`, ordered **after** `build-seed.sh` renders (so `seed_*_trial_faqs.sql` exists), running the gate; plus `bundle-consistency-gate.test.js` under `bun test scripts`. | — |

## Interfaces

- **Finding.** `{trial, field, structuredValue, faqExcerpt, reason}`. The
  baseline-diff key is `trial + ":" + field + ":" + structuredValue`. Identity is
  the **trial + field** — one shipped row per trial per family — NOT a cache key
  or `#hash`. An upstream `structuredValue` change (`active_not_recruiting →
recruiting`) is a new diff key, so it reads as unbaselined, never a silent match.
- **Family.** `{field, read(trial), contradicts(faqText, value)}`. The `status`
  family: `read` returns the trial `status`, `contradicts` maps it to
  recruiting-open via a fail-safe classifier then flags FAQ text asserting the
  opposite state (this also catches the self-contradicting FAQ, since one half
  opposes the structured field). The `criteria-in-prose` family is the same shape
  over the same shipped FAQ rows, `field: "criteria"`, comparing restated
  eligibility values to the structured criteria rows. Its comparator is
  materially harder (text-vs-rows) but stays inside the one `(text, value) → null
  | finding` contract — added depth is plan/impl work in one engine, not a second
  pipeline (SC5).
- **Audit output.** `{findings: Finding[], parseErrors: ParseError[]}` — always a
  two-field object, never a bare array. A malformed operand, or a shipped row
  whose `trial_id` joins to no trial, surfaces as a `parseError` (fail-closed,
  exit 1 unless baselined), never silence.

## Key Decisions

| Decision | Why | Rejected alternative |
| --- | --- | --- |
| **Shipped-prose operand = the rendered `trial_faqs.faq` row**, read from the `seed_*_trial_faqs.sql` build output | Per the Q2 ruling the operand is the exact bytes a patient reads; the render selects the shipped variant by a prompt-hash lookup the gate can't reconstruct, and multiple `#hash` variants share a hyphen spelling. Reading the render output is the ONLY way to name exactly what ships. The rendered `faq` column IS the prose — nothing is projected away. | Read `prose-cache.json` and select by slug/`#hash`: forbidden by Q2 — picks a variant by spelling heuristic and can't tell which of several `#hash` rows renders. This retires the prior cache-key model (alias `_`≡`-` resolution + orphan-baseline). |
| Structured operand stays source-side: `story.dsl` via scoped brace-depth reader | The invariant is "shipped prose must not contradict the field it _derives from_" — the field is the vendored source; reads exactly `status`/`criteria`, bounded and unit-testable. | Reuse `fit-terrain`'s parser: a devDep bin that emits SQL, not a field API. |
| Rule table parameterized by field family | One engine; a new field family (criteria, later phase/enrollment) is a data row, satisfying SC5 structurally. | A detector per field: duplicates the join + emit + diff — the ~80% restatement the #299/#127 fold exists to avoid. |
| Drift baseline; CI fails only on _unbaselined_ findings | Reconciles SC1 (gate reports the real DIABPREV-201 drift) with SC6 (CI stays green): the existing finding ships baselined+routed, only _new_ drift fails. The baseline _is_ the SC4 durable record. Sibling of `audit-gate.js` + `security/audit-baseline.json`. | Hard block with no baseline: red-walls forever, since the real finding is unfixable in-tree. Report-only: fails SC6. |
| **Orphan/unreferenced-key check is a SEPARATE cache-hygiene ledger, not part of SC1–SC6** | Per Q2, keys that render zero rows never ship, so they are not the shipped-prose operand. "A new orphan fails CI" keeps its teeth but as a distinct, clearly-labeled hygiene concern with its own accepted-set — it can never mask or be masked by shipped-prose drift. | Fold orphans into the drift baseline (the prior design): conflates cache hygiene with shipped-prose drift, exactly what the ruling separates. |
| Gate never writes either baseline; entries carry `review_by`; gate flags _stale_ entries | A self-appending baseline self-heals and masks new drift (the spec-110 concern). Baselining is a conscious human PR edit that routes the finding upstream first; a no-longer-reproducing entry is flagged _stale_ for removal. | Auto-append on finding / opaque permanent allowlist: silently absorbs new, resolved, and slipped findings alike. |
| Fail-SAFE recruiting classifier: unknown `status` → "not confirmed open" | Never treats an unrecognized status as recruiting; a future vendored value cannot make the gate assert a trial is open. A small self-contained pure predicate — see Cross-cutting. | Closed whitelist of open statuses: an unlisted value falls through to a wrong verdict — the fail-open trap spec 280 also forbids. |
| Gate lives in `check-seed.yml`, ordered after the render step | SC6 names the seed-check job; the shipped-prose operand is a render artifact, so the gate runs after `build-seed.sh` produces `seed_*_trial_faqs.sql`. SC3's `sha256sum -c SOURCE.sha256` (over the vendored source, not the `.build` output) still passes. | Independent pre-render step: the shipped operand doesn't exist yet. New standalone workflow: another required check the seed job already hosts. |

## Data flow and failure modes

1. `check-seed` runs `build-seed.sh` (render), then `bun scripts/bundle-consistency-gate.js` as its own step.
2. `readTrials(story.dsl)` + `readShippedFaqs(seed_*_trial_faqs.sql)` → `runAudit` → `diffLedger`.
3. Exit 1 (`::error::`) on any unbaselined finding or unjoinable-row `parseError`.
   The separate hygiene pass exits 1 under its own label on a newly-unreferenced
   key. Overdue-`review_by` and stale baseline entries emit an every-run
   `::warning::` but never block. Always print the full report.
4. SC3 holds by construction: the gate only reads (vendored source + `.build`
   render output); `build-seed.sh`'s `sha256sum -c SOURCE.sha256` over the
   vendored source still passes after a run.

## Cross-cutting

- **SC2 is a non-vacuous pass (low note, confirmed).** The CARDIO-301 pass-case
  test asserts the trial's actual shipped FAQ string (`status "recruiting"`, FAQ
  says "currently enrolling") is read AND yields no finding — not merely "no
  finding emitted." A pass that never read a real "currently enrolling" string
  would be a false green; the plan's test pins the asserted string.
- **SC5 is expressed as data, not a second detector (low note, confirmed).** The
  criteria family adds one row to `FAMILIES` and a `contradicts` comparator
  inside the one `(text, value) → finding` contract — no parallel join/emit/diff
  path. Reviewed here per SC5.
- **Recruiting-vs-not is a natural shared primitive with spec 280** (screener
  fail-open watch): both classify `story.dsl` `status` into recruiting-open and
  must fail-safe on unknown values. This gate defines its own small pure
  predicate and does **not** depend on spec 280 (unmerged; different contract).
  If both land, the predicate is a de-dup candidate — a forward note, not a
  dependency this design imposes.
- **Explainer flag DISCHARGED.** The prior design flagged explainer scope and the
  hyphen-vs-alias spelling as open questions for PM; both are now RULED (Q1/Q2).
  Condition-explainer is a consumed, spec-named future extension; the shipped
  spelling is the render's verbatim hyphen row. No open operand question remains.
- **Consumed design-inputs.** issue-127-299-detector-fold (incl. the 2026-08-02
  Q1/Q2 rulings): one detect+route detector parameterized by field, `status`
  charter + criteria second family, correction terminates upstream, does _not_
  close #127's staff-flag residual. spec-270 §1: audit output is a two-field
  `{findings, parseErrors}` object — a malformed or unjoinable operand is a
  diagnostic, never silence. (spec-270 §2/§3 ESM-on-`github-script` seam is N/A:
  this gate is a token-free `node` script with no privileged surface.)

## Clean break and scope

Additive by spec (Compatibility: "clean break not applicable"). The gate is a new
read over existing data; no shipped path is removed or shimmed. **Removes:**
nothing — there is no prior reconciliation to replace. It does not touch the
render path, does not edit the bundle, and does not close #127's headline
residual (a structured field stale versus the real-world protocol has no in-tree
operand — that stays a staff-flag on #127).

— Staff Engineer 🛠️
