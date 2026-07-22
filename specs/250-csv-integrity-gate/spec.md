# Spec 250 — CSV-integrity gate (metrics-CSV parse-validity, fail-closed on ragged / unknown-`event_type` rows)

> **Sibling to the in-flight Spec 110 (lockfile-integrity, PR #122) and Spec 220
> (dependency-compat, PR #231) — same arc-class and owner.** Each is a CI gate
> that closes a hygiene blind spot a bun-native or silent-tolerant tool cannot
> see: 110 watches lockfile-vs-manifest, 220 watches dependency-vs-runtime, 250
> watches row-vs-schema in the metrics CSVs. They are independent detectors —
> none subsumes another. This spec stands on its own; its invariants are stated
> here in full, not derived from 110/220. It inherits 110's **soundness
> invariant** verbatim in spirit: the detector is a genuine check, never a
> success-masks-the-condition heuristic.

**Classification:** Internal (measurement-integrity / CI). It ships no product
behaviour. It defends the trustworthiness of the fleet's XmR measurement — the
`n` and control limits every agent reads off `wiki/metrics/<dir>/2026.csv` — so a
malformed row can no longer silently move a series across the `n≥15` limits gate.

**Persona / job:** No direct persona. It backstops the measurement substrate the
whole team steers by: every agent's storyboard read and every kata metric depends
on the CSVs parsing to the honest `n`. A silently-dropped or silently-kept row
corrupts that read.

## Problem

`gemba-xmr` treats a CSV row whose field count differs from the header's as
mis-columned and **silently drops it** — no warning, no error, exit 0 (obstacle
#257). A metric `note` containing an **unquoted comma** (e.g. an EOD annotation
like `[EOD; 2 re-reads (21,18) collapsed]`) splits into extra fields and the whole
row vanishes from the series. The failure is **bidirectional**:

- **Silent under-count.** A ragged row is dropped, so `n` reads low. Observed
  2026-07-22: `product_share` read `n=13` of **16** true distinct-day points
  because three rows carried unquoted note commas — the difference between
  `insufficient_data` and clearing the `n≥15` XmR limits gate. After re-quoting
  the three notes (values unchanged, wiki `41ac07b`), `n=16` and real limits
  computed. Any `insufficient_data` reading anywhere in the fleet may be masking
  real points the same way.
- **Silent over-read / mis-count.** A row whose corruption leaves a *valid*
  `event_type` in place can be counted anyway, or counted into the wrong slot —
  a malformed point admitted as if clean.

Two structural facts make this the same latent-trap class as 110/220 — a tool
tolerating a condition an explicit check would catch:

1. **The parse is not validated.** Nothing in the read path fails closed on a
   ragged row or on a row whose `event_type` slot is not a known machine name. A
   drop is indistinguishable from a genuinely-absent point.
2. **The heuristic fails in lockstep with the analyzer.** An `awk`/quote-presence
   sniff over the same rows makes the same mistake the analyzer does — it is not
   an independent check. This is precisely the "self-heals + masks" class this
   repo already rejects for CI gates (the Spec 110 soundness invariant).

**The header contract (grounding).** Every `wiki/metrics/<dir>/2026.csv` carries
the authoritative 8-column header, in order:

    date,metric,value,unit,run,note,event_type,host_run

`event_type` is the **7th** column; `note` (the 6th) is the field that carries
free text and is the usual source of unquoted commas. A valid row has exactly
these 8 RFC-4180 fields, and its `event_type` is one of the authoritative machine
names (empirically: `kata-shift`, `agent-storyboard`, `agent-shift`,
`agent-dispatch`, `monitor-spec-design`, `agent-skill`; `gh-live` appears only in
the `run` column, never as an `event_type`). The exact column contract and the
canonical name set are the **technical-writer schema half** (see Scope).

**The load-bearing feasibility problem — reachability (resolve at design).** The
metric CSVs live in `wiki/metrics/<dir>/2026.csv`, and `wiki/` is a **separate,
`.gitignore`d git repository** (`github.com/forwardimpact/bionova-apps.wiki`); the
`.gitignore` states the app repo "must not track `wiki/` at all," and the main
repo tracks **zero** metric CSVs. `wiki/metrics/COUNTING.md` § Enforcement ceiling
records the consequence directly: "Doc-only is the honest ceiling today. The CSVs
live in the `.gitignore`d wiki repo with no CI, and `fit-xmr` / `fit-wiki` are
compiled npm consumables with no extension point." **A main-repo pull-request gate
therefore cannot see the files it protects, and the wiki repo has no CI and no
pull-request surface to block.** This spec must resolve *which CSV set* and *which
CI surface* the reader-detects gate runs against, or tooth 2 collapses to advisory
and the upstream writer-prevents fix becomes the sole durable lever. That
resolution is the central design decision (see Constraints and SC7).

## Scope

Two teeth, one spec. The teeth are the **writer-prevents / reader-detects** split.

**In scope:**

| Component | What it does |
|---|---|
| Reader-detects gate (tooth 2 — this repo's deliverable) | A CI check that parses each owned metrics CSV with a **real CSV reader** and fails **closed / RED** on any row that is not valid, **naming the offending file and line**. A row is valid iff it has exactly the 8 header fields **AND** its `event_type` is in the authoritative registry. Turns a seeded ragged or unknown-`event_type` row into a red build. |
| Conjunction check (both legs, per row) | The validity test is `width == header_width` **AND** `event_type ∈ registry`; the gate **FAILS** when `¬(width == header_width) ∨ (event_type ∉ registry)`. Both legs are required — each covers the other's blind spot (see Constraints). |
| Authoritative-source consumption | The gate reads the header contract and the event-name registry from **one authoritative source**, never a duplicated allowlist. |
| Header/registry schema (technical-writer half — spec-input) | Fixes the canonical 8-column header contract, the canonical `event_type` registry as a single source, the RFC-4180 note-quoting rule, and the valid-row definition the gate consumes. Owned by technical-writer. |
| Writer-prevents fix (tooth 1 — upstream, not this repo) | `gemba-xmr` / `fit-xmr` (and `gemba-wiki` at write time) fail **closed** (nonzero exit, name the offending line) on a ragged or unknown-`event_type` row, and quote notes per RFC-4180 at write time — never silent-drop + under-count `n`. This is the **durable / primary** lever. It is **not repo-local**: it routes to the shared-instrument maintainer (improvement-coach), tracked on obstacle #257. Named here for completeness; not delivered by this spec's diff. |

**Out of scope:**

| Item | Why | Where it belongs |
|---|---|---|
| The upstream `gemba-xmr`/`fit-xmr`/`gemba-wiki` fix (tooth 1) | Not repo-local; the instruments are compiled npm consumables with no extension point. | Shared-instrument maintainer (improvement-coach), obstacle #257. |
| Vendoring the metrics CSVs into the main repo | `.gitignore` forbids the app repo tracking `wiki/` at all; mirroring the CSVs would violate that invariant and create a drift copy. | Deliberately declined. |
| Retuning what counts as a valid `event_type` beyond the authoritative set | This gate enforces the registry; it does not expand or curate it. | The technical-writer schema half / a future schema change. |
| The `--event-type='*'` over-read (obstacle #236) | A filter-semantics defect (prepends the pre-kata-shift era), not a parse-validity defect. Distinct root. | Obstacle #236 (improvement-coach). |
| Family-aware `(date, metric)` uniqueness / de-dup | A same-day-dup counting concern (COUNTING.md families), not a parse-validity concern. | The upstream `fit-xmr validate` path named in COUNTING.md § Enforcement ceiling. |
| A recording convention alone ("quote every note comma") | A convention is unenforceable and will regress; it is the stopgap, not the fix. | Interim guidance only. |

## Constraints

- **Genuine CSV parse, never a heuristic.** The detector must use a real
  RFC-4180 CSV reader, **never** an `awk`/quote-presence sniff. A heuristic fails
  in lockstep with the analyzer (Problem fact 2) — the root cause of the
  false-clears — so it is not an independent check. This is the Spec 110
  soundness invariant, applied to parsing.
- **Single authoritative source, never a duplicated allowlist.** The gate reads
  the header contract and the `event_type` registry from one source of record. A
  duplicated allowlist is itself a drift vector — it false-REDs on a legitimately
  new name and goes green on a typo. This is not theoretical: the ad-hoc name set
  used while scoping this work had **already drifted** — it omitted
  `monitor-spec-design` and `agent-skill` and invented a phantom `kata-storyboard`.
- **Both conjunction legs are required.** Width-only misses a corruption that
  leaves the wrong data in a same-width row whose `event_type` slot still reads as
  a real name; name-only misses tail/mid-row corruption that changes the width but
  leaves a valid `event_type` in place (fixture 2 below is the concrete proof).
  Neither leg alone is sound.
- **Fail-closed LOUD, and name the line.** A bad row produces a nonzero exit and
  an error identifying the file and line number. The gate must **never** silently
  drop, silently keep, or self-heal (auto-requote and continue) — a self-healing
  check is the same mask-the-condition class this repo rejects. It detects; it
  does not repair.
- **The gate must reach the files it protects — no false green.** A passing
  result must mean the owned CSVs were actually parsed and validated, never that
  the check could not see them, found no files, or a tool was absent. Because the
  CSVs live in the `.gitignore`d wiki repo with no CI (Problem, reachability), the
  design **must** name a CI surface that both reads the real CSV set and fails RED
  on a bad row. **If no repo-local surface can both see the wiki CSVs and fail
  closed, the artifact records tooth 2 as advisory-only and names tooth 1
  (upstream) as the sole durable lever — it does not ship a false-green gate.**
- **Weaken no existing gate** (`check-audit`, `check-secrets`, `check-edge`,
  lint, typecheck, test, `coaligned`, smoke, and the sibling 110/220 gates should
  they land).
- **No over-claimed severity.** This is measurement-integrity / recording
  hygiene; the gate fails builds on a malformed-row condition, but the finding
  class is not a security advisory.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A CI check parses each owned metrics CSV with a real CSV reader and fails RED, naming the offending file and line, on a row that is not valid | a seeded ragged row turns the check red and the log names its file:line |
| 2 | The validity test is the conjunction `width == header_width` **AND** `event_type ∈ registry`; the check fails when either leg is violated | a seeded 8-field row with an out-of-registry `event_type`, **and** a seeded ragged row whose `event_type` slot is still a valid name, **each** turn the check red |
| 3 | The check reads the header contract and the `event_type` registry from one authoritative source, not a duplicated allowlist | the check configuration references the single source; no second copy of the name set exists in the gate |
| 4 | A green result means the CSVs were actually parsed — the check cannot pass by finding no files, an absent tool, or a heuristic standing in for the parse | a change that disables the parse (or hides the CSV set) turns the check red, not green |
| 5 | The gate detects only — it never rewrites, requotes, or drops a row | the check makes no writes to any CSV; a bad row is reported, not repaired |
| 6 | The three real regression fixtures (below) are committed as the gate's acceptance corpus and stay verifiable after the demonstrating repairs, exercising both legs and both failure directions | the committed regression check runs in CI and covers all three fixtures |
| 7 | The reachability is resolved: the artifact names the owned CSV set and a CI surface that both reads it and fails RED on a bad row — **or** records tooth 2 as advisory-only and tooth 1 as the sole durable lever. No false-green gate ships | the design document and the check's trigger/target configuration |

### Regression fixtures (the acceptance corpus)

All three are real defects found and repaired on the wiki repo 2026-07-22; each
maps to a distinct detector leg and becomes an acceptance test. The corrupt
states are captured by provenance SHA (the live CSVs are now repaired, so the
tests seed the corrupt row from the recorded state, not from the current file):

| # | Fixture (wiki repo) | Defect | Leg / direction exercised | Repaired at |
|---|---|---|---|---|
| 1 | `metrics/product-mix/2026.csv` | 3 rows, unquoted note commas → extra fields; rows silently dropped → under-count (`n` 13/16) | width leg; **under-count** direction | `41ac07b` |
| 2 | `metrics/product-manager/2026.csv` line 30 | tail corruption, 10 fields, `event_type` slot still valid → a **name-only** check would keep it; only the width leg rejects it | width leg over name-only; **mis-count / over-read** direction | `b159b88` |
| 3 | `metrics/kata-spec/2026.csv` line 4 | 2 unquoted note commas → 10 fields, row dropped → `specs_drafted` under-counted by 1 (`n` 16→17 after repair) | width leg on a Family-2 count metric; **under-count** direction | `79878d2` |

## Notes for design

- **Reachability is the first decision.** Resolve SC7 before anything else. The
  wiki repo has no CI and no PR surface; the app repo must not track `wiki/`. The
  honest candidates are (a) a main-repo scheduled / dispatch workflow that clones
  the wiki repo at run time and validates `metrics/*/2026.csv`, failing the run
  RED — a detector on main-repo CI, observable but not a pre-merge blocker (the
  wiki has no merge to block); or (b) declaring tooth 2 advisory and leaning on
  the upstream writer-prevents fix (tooth 1). Pick honestly; do not ship a gate
  that reads green because it never saw the files.
- **Single source of record.** The design names where the header contract and the
  `event_type` registry live as one artifact the gate reads. Coordinate with the
  technical-writer schema half; do not embed a second copy of the name set.
- **Sibling shape.** 110 (PR #122) and 220 (PR #231) both carry a committed
  regression check that CI exercises on `main` (as Spec 20 does with
  `audit-gate.test.js`). This gate should follow that shape for SC6, sharing a
  design idiom where practical.
- **Fixtures seed corrupt rows.** The live CSVs are repaired; the acceptance
  tests reconstruct each corrupt row from its recorded provenance state, not from
  the current (clean) file.

— Security Engineer 🔒
