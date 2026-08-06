# Plan 300-a: Prose-vs-structured-field drift detector

Spec: [spec.md](spec.md). Design: [design-a.md](design-a.md). This plan says HOW
and in WHAT ORDER to implement the design.

## Approach

Build one read-only Node gate, `scripts/bundle-consistency-gate.js`, bottom-up:
the two readers first (`readTrials` over `story.dsl`, `readShippedProse` over the
rendered seed SQL), then the `status` field-family rule that is the load-bearing
piece, then the `runAudit` join, then the `diffLedger` baseline diff, then the
`main` entrypoint that wires them and sets exit codes, then the CI step, then the
tests. The gate is modeled cell-for-cell on `scripts/audit-gate.js` (baseline
diff, `review_by`/overdue handling, env-injected fixtures for tests) — a sibling,
not a new pattern. Every step is a pure addition; nothing is removed (additive
per the spec's compatibility stance). The gate runs after `build-seed.sh` renders,
so both `seed_*_trial_faqs.sql` and `seed_*_consent_summaries.sql` exist before it
reads them.

Libraries used: none. (Plain `node` with `node:fs` / `node:child_process`, same
as `audit-gate.js`; tests use `bun test scripts`.)

## Plan-owned: the `status` family comparator

The design leaves the comparator's internal logic to the plan. It is a
**posture × status matrix**, not a pure open/not-open binary — a distinction the
pre-flight execution-verify forced (see Execution verification): a forward
"people will join" is true for a trial that WILL open (`not_yet_recruiting`) but
false for one whose enrollment is over (`active_not_recruiting` / `completed`).

**Prose posture — three phrase sets (case-insensitive), value-only, no raw enum
token in any emitted string:**

| Posture | Matches (illustrative; the committed regex set is canonical) |
| --- | --- |
| `currentlyOpen` | `currently enrolling`, `now\|actively enrolling`, `is enrolling`, `currently recruiting`, `now\|actively recruiting`, `looking for about N … to participate` |
| `forward` | `people\|participants will join\|participate\|enroll`, `… will join\|participate`, `will enroll about N` |
| `currentlyClosed` | `not currently recruiting`, `no longer enrolling\|recruiting\|accepting`, `not accepting new`, `has finished enrolling`, `not yet recruiting`, `enrollment is\|has closed` |

The sets key on **specific posture phrases, never the bare token `enroll`** — the
render puts "how do I enroll", "when you enroll", "trial enrollment" in every
trial's prose; matching the bare token would false-flag all six trials.

**Contradiction matrix — which prose posture contradicts each structured
`status`:**

| structured `status` | `currentlyOpen` | `forward` | `currentlyClosed` |
| --- | --- | --- | --- |
| `recruiting` | — | — | **flag** |
| `active_not_recruiting` | **flag** | **flag** | — |
| `completed` | **flag** | **flag** | — |
| `not_yet_recruiting` | **flag** | — | — |
| any other value / `null` / absent (fail-safe) | **flag** | **flag** | — |

The fail-safe row is the design's "unknown status → not confirmed open" decision:
an unrecognized status never lets an open OR forward assertion pass unflagged. It
is deliberately the strictest row, not a silent pass.

## Plan-owned: seeded drift baseline

`scripts/bundle-drift-baseline.json` ships with the **three** findings the gate
produces on the current bundle (execution-verified), each routed upstream so CI
stays green (SC6) while the gate still reports them (SC1). Keyed by the
baseline-diff key `source:trial:field:structuredValue`:

| baseline-diff key | shipped prose (excerpt) | route |
| --- | --- | --- |
| `trial_faqs.faq:diabetes-prevention:status:active_not_recruiting` | "currently enrolling participants" | fit-terrain, `review_by` set |
| `consent_summaries.summary:diabetes-prevention:status:active_not_recruiting` | "About 300 people will join DIABPREV-201" | fit-terrain, `review_by` set |
| `consent_summaries.summary:oncora-phase1:status:completed` | "About 60 people will participate in this study" | fit-terrain, `review_by` set |

The third entry (`oncora-phase1`, a completed trial whose consent still says
people "will participate") is a live instance of the same class beyond the spec's
DIABPREV-201 headline — the spec itself calls this "a class, not one string." It
is baselined and routed like the other two.

The raw underscored status token (`active_not_recruiting`, `completed`) appears
in the diff key's `structuredValue` segment — that is the join value, not emitted
prose. Step 3's ban on raw enum tokens is on the finding's `reason`/`excerpt`
(the human-facing strings), not on the diff-key segment.

## Step 1: Gate module + `readTrials`

Create the gate module and its first reader: a scoped brace-depth scan over
`story.dsl` extracting each `trial <id> { … }` block's declared `status` (the
only field the shipped `status` family reads).

- **Created:** `scripts/bundle-consistency-gate.js`

```js
// Scoped reader: per `trial <id> { … }`, capture `status`. Not a general DSL
// parser — reads exactly the field the shipped rule needs.
export function readTrials(src) {
  const trials = {};
  const parseErrors = [];
  const re = /\btrial\s+([a-z0-9-]+)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const id = m[1];
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(re.lastIndex, i - 1);
    const sm = body.match(/\bstatus\s+"([^"]*)"/);
    if (!sm) parseErrors.push({ kind: "trial-no-status", id });
    trials[id] = { status: sm ? sm[1] : null };
  }
  return { trials, parseErrors };
}
```

Note the join key is the **block id** (`diabetes-prevention`), not the display
`name` (`DIABPREV-201`) — the seed `trial_id` carries the same slug
(`story.dsl:1134`, seed `trials.id`).

Verification: unit test (Step 9) — the six trial ids read with their statuses;
a `trial { }` missing `status` yields a `parseError`, not a silent drop.

## Step 2: `readShippedProse`

Add the second reader, called once per source over the rendered seed SQL. Parse
each `($$trial_id$$, $$text$$)` INSERT row (dollar-quoted, so the text may contain
`$` but never `$$`), tag it with its `source`.

- **Modified:** `scripts/bundle-consistency-gate.js`

```js
export function readShippedProse(src, source) {
  const rows = [];
  const parseErrors = [];
  const re = /\(\$\$([a-z0-9-]+)\$\$,\s*\$\$([\s\S]*?)\$\$\)[,;]/g;
  let m;
  while ((m = re.exec(src))) rows.push({ trialId: m[1], source, text: m[2] });
  if (rows.length === 0) parseErrors.push({ kind: "no-rows", source });
  return { rows, parseErrors };
}
```

The two sources are `trial_faqs.faq` (`seed_*_trial_faqs.sql`) and
`consent_summaries.summary` (`seed_*_consent_summaries.sql`) — the two `per_trial`
tables (`story.dsl:1241-1242`). Row shape verified at both seed headers
(`INSERT INTO "trial_faqs" ("trial_id", "faq")`, `… "consent_summaries"
("trial_id", "summary")`).

The `[\s\S]*?` capture is non-greedy and relies on shipped prose never containing
a literal `$$`. Guard the assumption rather than trusting it: a source whose row
count is not the six trials, or a captured text suspiciously short for a rendered
prose row, is a `parseError` — not a silent under-read. The `no-rows` guard alone
only catches zero rows, not a truncated one.

Verification: unit test — six rows per source; the `diabetes-prevention` consent
row's text contains "About 300 people will join" (the enrollment-bearing shipped
variant — see Execution verification); a fixture with a `$$`-bearing row surfaces
a `parseError`.

## Step 3: The `status` field family

Add the `FAMILIES` table with its single `status` member: the three posture
phrase sets, the contradiction matrix, and `contradicts(text, status)` returning
`null | {reason, excerpt}`. Source-agnostic — it runs over every shipped row
regardless of which table produced it (SC5: one rule, not a per-surface path).

- **Modified:** `scripts/bundle-consistency-gate.js`

Encode the three phrase sets and the matrix from § Plan-owned above. `contradicts`
looks up the row for `status` (fail-safe default for an unrecognized value), then
returns the first posture hit its row flags, with the matched substring as
`excerpt`. No emitted `reason`/`excerpt` contains a raw underscored status token
beyond the structured value it is quoting.

Verification: unit test asserts every cell of the matrix — including
`not_yet_recruiting` + `forward` → **no** finding (the false-positive the binary
model produced), and the fail-safe row flagging an unknown status.

## Step 4: `runAudit`

Join each shipped row to its trial by exact `trialId`, run every family over
every row, collect findings. A row whose `trialId` matches no `story.dsl` trial
is a `parseError` (fail-closed), never a silent drop.

- **Modified:** `scripts/bundle-consistency-gate.js`

```js
export function runAudit(trials, rows) {
  const findings = [], parseErrors = [];
  for (const row of rows) {
    const trial = trials[row.trialId];
    if (!trial) { parseErrors.push({ kind: "unjoinable-row", source: row.source, trialId: row.trialId }); continue; }
    for (const fam of FAMILIES) {
      const value = fam.read(trial);
      const hit = fam.contradicts(row.text, value);
      if (hit) findings.push({ source: row.source, trial: row.trialId, field: fam.field, structuredValue: value, excerpt: hit.excerpt, reason: hit.reason });
    }
  }
  return { findings, parseErrors };
}
```

Verification: unit test — the full bundle yields exactly the three findings in
§ Plan-owned; an injected row with an unknown `trialId` yields one
`unjoinable-row` parseError.

## Step 5: `diffLedger` + seed the drift baseline

Add the baseline diff and the committed baseline file. Set-diff findings against
the baseline by the diff key `source:trial:field:structuredValue`; partition into
`unbaselined` (fail), `overdue` (baselined, `review_by` past — warn), `stale`
(baselined but no longer reproducing — warn). Copy the implementing logic from
`audit-gate.js` — the `review_by`/overdue/pending handling
(`scripts/audit-gate.js:156-185`) and the set-diff/stale partition
(`scripts/audit-gate.js:215-222`), not just the header comment.

- **Modified:** `scripts/bundle-consistency-gate.js`
- **Created:** `scripts/bundle-drift-baseline.json`

The baseline seeds the three entries from § Plan-owned, each with a `fit-terrain`
route ref and a `review_by` date. The gate never writes this file — baselining is
a human PR edit that routes the finding upstream first (the spec-110
self-healing concern; `audit-gate.js` sibling).

Verification: unit test — with the seeded baseline, `unbaselined` is empty (exit
0); drop one entry and that finding becomes `unbaselined` (exit 1); an entry with
a past `review_by` is `overdue`; a baseline entry with no matching finding is
`stale`.

## Step 6: Cache-hygiene pass (separate ledger)

Add the clearly-labeled, **explicitly not-SC1–SC6** hygiene pass: scan
`prose-cache.json` `clinical_trial_faq_` keys that render zero rows (spelling
aliases, non-shipped `#hash` variants, orphan slugs), diffed against its own
accepted-set. Never mixed into the drift ledger.

- **Modified:** `scripts/bundle-consistency-gate.js`
- **Created:** `scripts/bundle-cache-hygiene.json`

Verification: unit test — a synthetic newly-unreferenced key is reported under the
hygiene label and fails the hygiene pass; it never appears in the drift ledger.

## Step 7: `main` entrypoint

Wire the readers over both seed files + `story.dsl`, run the audit, diff against
the baseline, print the full report, set exit codes. Env overrides make it
testable exactly like `audit-gate.js` (`AUDIT_JSON_FILE`): `SEED_DIR`,
`STORY_DSL`, and a baseline path argv, so a test feeds a fixture directory
without touching the real bundle. Production defaults, used when the env vars are
unset: `SEED_DIR` = `data/synthetic/.build/products/polaris/site/supabase/migrations`
(the gitignored render output, per design-a.md:89) and `STORY_DSL` =
`data/synthetic/story.dsl`.

- **Modified:** `scripts/bundle-consistency-gate.js`

Exit 1 (`::error::`) on any `unbaselined` finding or any `parseError`. The hygiene
pass exits 1 under its own label on a newly-unreferenced key. `overdue` and
`stale` emit an every-run `::warning::` but never block. Always print the full
report (findings, parseErrors, overdue, stale) before exiting.

Verification: `SEED_DIR=… STORY_DSL=… node scripts/bundle-consistency-gate.js`
over the real rendered bundle exits 0 with the three findings all baselined
(measured — see Execution verification); over a fixture with an unbaselined
finding, exit 1.

## Step 8: CI step in check-seed

Add the gate as a new step in the existing `seed-build` job, **after** the
`bash scripts/build-seed.sh` step (so both `seed_*` tables exist) and its
determinism assertions.

- **Modified:** `.github/workflows/check-seed.yml`

```yaml
      - run: bun scripts/bundle-consistency-gate.js
```

(Placed as its own `run` step after the existing render+assert block, before
job end.) The gate reads the gitignored `.build/` render output the preceding
`build-seed.sh` step left in the same job's workspace — no `SEED_DIR`/`STORY_DSL`
override, so it takes the Step 7 production defaults. SC3 holds: the gate only
reads; `build-seed.sh`'s `sha256sum -c SOURCE.sha256` over the vendored source
still passes.

Verification: the step runs green on the current bundle (all three findings
baselined); a seeded unbaselined contradiction fails the job (SC6).

## Step 9: Tests

Cover SC1–SC6 and the failure modes.

- **Created:** `scripts/bundle-consistency-gate.test.js` (run by `bun test scripts`)

| Case | Asserts | SC |
| --- | --- | --- |
| Both DIABPREV-201 rows flag | `runAudit` over the bundle reports `trial_faqs.faq:diabetes-prevention` AND `consent_summaries.summary:diabetes-prevention`, both vs `active_not_recruiting` | SC1 |
| Non-vacuous clean recruiting | `oncora-phase3` consent's real "About 450 people will join" string (recruiting) is read AND yields no finding; `cardio-outcomes` (recruiting) clean | SC2 |
| Third-instance | `consent_summaries.summary:oncora-phase1` (completed) flags on "will participate" | SC1 (class) |
| No mutation | after a full run, `sha256sum -c data/synthetic/SOURCE.sha256` passes | SC3 |
| Two distinct records | the DIABPREV-201 FAQ finding and consent finding are two entries with distinct `source` segments, not collapsed | SC4 |
| One rule, both sources | the same `contradicts` flags FAQ and consent rows; no per-surface code path | SC5 |
| Matrix + fail-safe | every matrix cell; `not_yet_recruiting`+`forward` → no finding; unknown status → flag | fail-safe |
| Unjoinable row | a fixture row with an unknown `trialId` → one `unjoinable-row` parseError, exit 1 | fail-closed |
| Baseline diff | seeded baseline → clean; dropped entry → `unbaselined` (exit 1); past `review_by` → `overdue`; non-reproducing entry → `stale` | SC6 |
| Hygiene separate | a synthetic unreferenced key fails the hygiene pass under its own label, absent from the drift ledger | — |

Verification: `bun test scripts` passes.

## Risks

| Risk | Mitigation |
| --- | --- |
| **The spec/design name CARDIO-301's FAQ as saying "currently enrolling" (SC2), but no recruiting trial's FAQ carries that phrase — it is in DIABPREV-201's FAQ, the FAIL case (execution-verified).** A test written to the letter of SC2 would assert a string that does not exist and pass vacuously or fail to compile. | Step 9's SC2 case reads a **real** recruiting-consistent open-assertion — `oncora-phase3` consent's "About 450 people will join" (recruiting → forward → no finding) — and keeps CARDIO-301 as an additional clean case. Flagged to PM as a spec.md refinement; the plan satisfies SC2's **intent** (a consistent trial passes clean, non-vacuously) without depending on the inaccurate phrase. |
| The `status` comparator is a posture × status matrix, not the "recruiting-open fail-safe classifier" the design's prose implies. A reviewer reading the design alone would expect a two-bucket classifier. | The design leaves the `contradicts(text, value)` internals to the plan; the matrix IS that internal logic and preserves the design's fail-safe decision (unknown status → strictest row). § Plan-owned states the phrase sets and matrix in full. The binary model was execution-verified to false-flag `not_yet_recruiting` (copd-inhaler's "will enroll about N") — the matrix is the corrected form of the same rule, not a scope change. |
| The drift baseline seeds **three** findings, not the two the design's illustrative line names — `oncora-phase1`'s completed-trial consent is a live third instance. A reviewer expecting exactly the DIABPREV-201 pair would read the third as noise. | § Plan-owned lists all three with routes; the design's baseline component already says "slugs named here are illustrative" and the spec frames this as "a class, not one string". If a future render fixes one upstream, the gate flags it `stale` for removal. |
| The forward-enrollment lexicon keys on phrases, not the bare token `enroll`; a future prose spelling ("will be enrolling", "opening enrollment soon") could slip past it (a miss, not a false flag). | The plan-owned phrase sets are the canonical starting set; a missed spelling surfaces as an un-caught drift, not a false green on a caught one, and is added as one more regex — data, not a new path. Noted for the implementer, not planned around. |

## Execution recommendation

Single engineering agent, sequential: Steps 1→7 are a straight dependency chain
within one module (readers → rule → audit → diff → main), Step 8 wires CI, Step 9
verifies each SC as it lands. No parallelism benefit — the whole change is one
script, two JSON baselines, one CI step, one test file. Route to `kata-implement`
on a `feat/300-prose-field-drift-detector` branch once the design is approved and
merged.

## Execution verification (pre-flight, exp #331)

This plan was applied to a throwaway build of the gate off the branch, run over
the **rendered** bundle (`bash scripts/build-seed.sh`), then discarded — the
pre-flight is execution-verified, not only panel-clean. Measured 2026-08-06:

- **Finding set — exactly three, zero false positives** on the six-trial bundle:
  `trial_faqs.faq:diabetes-prevention` (active_not_recruiting, "currently
  enrolling"), `consent_summaries.summary:diabetes-prevention`
  (active_not_recruiting, "people will join"),
  `consent_summaries.summary:oncora-phase1` (completed, "people will
  participate"). SC1's consent-half fires on the real shipped row.
- **SC3** — `sha256sum -c data/synthetic/SOURCE.sha256` passes after the run
  (gate only reads).
- **Fail-safe** — injecting an unknown status (`paused_enrollment`) on
  DIABPREV-201 still flags both its rows (treated as past-closed), confirming the
  fail-safe row's teeth.

Three findings the paper design could not see, all folded in above (none changes
the design's shape — one engine, one rule table, two `per_trial` readers, one
drift baseline):

1. **Consent-variant confirmed (the #331 watch-item).** Two cache variants exist
   for the diabetes-prevention consent (`#6dc13c9f` no-enrollment vs `#940cc013`
   enrollment-bearing). The **enrollment-bearing** variant is the one that renders
   and ships ("About 300 people will join DIABPREV-201") — so SC1's consent-half
   is live, not stranded. Verified against the rendered
   `seed_010_consent_summaries.sql`.
2. **Posture × status matrix, not a binary.** A pure open/not-open classifier
   false-flags `copd-inhaler` (`not_yet_recruiting`) on its consent's "the study
   will enroll about N people" — a forward statement that is true for a trial that
   will open. The matrix (§ Plan-owned) flags `forward` only against past-closed
   statuses (`active_not_recruiting`, `completed`) and the fail-safe default. This
   corrects the design's binary-classifier prose.
3. **SC2's named phrase is inaccurate, and a third live finding exists.**
   CARDIO-301's FAQ does not say "currently enrolling" (that phrase is
   DIABPREV-201's FAQ, the FAIL case); the non-vacuous SC2 pass reads a real
   recruiting-consistent open-assertion instead. And `oncora-phase1`'s completed
   consent is a live third instance of the drift class, baselined and routed. Both
   surfaced to PM as spec.md refinements — reported, not withheld.

The throwaway gate was discarded; only this plan and the re-derived design carry
forward. Held at `spec draft` (PR #316, spec head `1efc5dd`): no PR, no merge, no
STATUS write — this touches no human-gated state and gate-merges in order only
after human `spec approved`.

— Staff Engineer 🛠️
