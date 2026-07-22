# Spec 250 — CSV-integrity gate (metrics-CSV parse-validity, fail-closed on ragged / unknown-`event_type` rows)

> **Sibling to Spec 110 (lockfile-integrity, PR #122) and Spec 220
> (dependency-compat, PR #231) — same arc-class and owner.** Each closes a
> hygiene blind spot a silent-tolerant tool cannot see: 110 watches
> lockfile-vs-manifest, 220 watches dependency-vs-runtime, 250 watches
> row-vs-schema in the metrics CSVs. They are independent detectors. This spec
> stands on its own and inherits 110's **soundness invariant**: the detector is a
> genuine check, never a success-masks-the-condition heuristic.

**Classification:** Internal (measurement-integrity / CI). It ships no product
behaviour. It defends the trustworthiness of the fleet's XmR measurement — the
`n` and control limits every agent reads off `wiki/metrics/<dir>/2026.csv` — so a
malformed row can no longer silently move a series across the `n≥15` limits gate.

**Persona / job:** No direct persona. It backstops the measurement substrate the
whole team steers by: every storyboard read and every kata metric depends on the
CSVs parsing to the honest `n`. A silently-dropped or silently-kept row corrupts
that read.

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
  the three notes (values unchanged; product-mix rows dated 07-07, 07-08,
  07-11), `n=16` and real limits
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
2. **A heuristic fails in lockstep with the analyzer.** An `awk`/quote-presence
   sniff over the same rows makes the same mistake the analyzer does — it is not
   an independent check. This is the "self-heals + masks" class this repo already
   rejects for CI gates (the Spec 110 soundness invariant).

**The header contract (grounding).** Every `wiki/metrics/<dir>/2026.csv` carries
the authoritative 8-column header, in order:

    date,metric,value,unit,run,note,event_type,host_run

`event_type` is the **7th** column; `note` (the 6th) carries free text and is the
usual source of unquoted commas. A valid row satisfies a **three-leg
conjunction**, all legs required — the gate fails RED, naming file and line, on
any leg:

- **(A) width.** The row parses to exactly **8** RFC-4180 fields **and** the
  file's header names match `date,metric,value,unit,run,note,event_type,host_run`
  **in order** (the header is checked once, against a committed constant).
- **(B) registry.** Column 7, `event_type`, is one of the authoritative machine
  names (empirically: `kata-shift`, `agent-storyboard`, `agent-shift`,
  `agent-dispatch`, `monitor-spec-design`, `agent-skill`; `gh-live` appears only
  in the `run` column, never as an `event_type`). This leg doubles as the
  column-7 typed anchor.
- **(C) shape.** Column 1, `date`, parses as a calendar day **or** an ISO-8601
  timestamp, **and** column 3, `value`, parses as a number. These are the
  column-1 and column-3 typed anchors.

The typed anchors sit at positions **1 / 3 / 7**, so any count-preserving field
shift disturbs at least one anchor and fails leg B or C — closing the
width-preserving hole that A∧B alone would miss (a real machine name slid into
slot 7 with garbage displaced into the tail). Column 8, `host_run`, stays
**unconstrained** — it is legitimately empty-or-numeric, so it carries no anchor
and needs none. The date anchor must be the **format-tolerant superset**
(calendar **or** ISO), never a brittle single-format pin. The exact column
contract and the canonical name set are the **technical-writer schema half** (see
Scope), which must land as a single machine-readable source of record — not
prose.

**The reachability resolution (load-bearing).** The metric CSVs live in
`wiki/metrics/<dir>/2026.csv`, and `wiki/` is a **separate, `.gitignore`d git
repository** (`github.com/forwardimpact/bionova-apps.wiki`); the `.gitignore`
states the app repo "must not track `wiki/` at all," and the main repo tracks
**zero** metric CSVs. `wiki/metrics/COUNTING.md` § Enforcement ceiling records the
consequence: "the CSVs live in the `.gitignore`d wiki repo with no CI, and
`fit-xmr` / `fit-wiki` are compiled npm consumables with no extension point." A
main-repo *pull-request* gate cannot see the files it protects, and the wiki repo
has no CI and no PR surface to block. **This does not make the gate infeasible:**
a main-repo scheduled / dispatch CI surface can read the owned CSV set (the wiki
repo, checked out at run time) and fail RED on a bad row — a detector, observable,
though not a pre-merge blocker (the wiki has no merge to block). A pre-flight
prototype has demonstrated this: a genuine RFC-4180 parse over a seeded ragged
row exits nonzero naming the line (width leg), over an out-of-registry
`event_type` exits nonzero on the registry leg, over a row with a non-parsing
`date` or non-numeric `value` exits nonzero on the shape leg, and over the same
content correctly quoted exits 0.
So this spec **commits tooth 2 to a reachable detector**; *which* surface is the
design decision (SC7). Advisory-collapse is not a passing outcome — see
Constraints.

## Scope

Two teeth, one spec — the **writer-prevents / reader-detects** split.

**In scope:**

| Component | What it does |
|---|---|
| Reader-detects gate (tooth 2 — this repo's deliverable) | A CI check that reads the owned metrics CSV set (the wiki repo's `metrics/*/2026.csv`, reachable from a main-repo scheduled/dispatch surface) with a **real CSV reader** and fails **closed / RED** on any invalid row, **naming the offending file and line**. Turns a seeded ragged or unknown-`event_type` row into a red build. |
| Conjunction check (three legs, per row) | The validity test is `(A) width == 8 + header-order` **AND** `(B) event_type ∈ registry` **AND** `(C) date parses (calendar or ISO) + value numeric`; the gate **FAILS** when any leg is violated: `¬A ∨ ¬B ∨ ¬C`. All three legs are required — the typed anchors at columns 1/3/7 close each other's blind spot (see Constraints). |
| Authoritative-source consumption | The gate reads the header contract and the event-name registry from **one authoritative source**, never a duplicated allowlist. |
| Header/registry schema (technical-writer half — spec-input) | Fixes the canonical 8-column header contract, the canonical `event_type` registry, the RFC-4180 note-quoting rule, and the valid-row definition — delivered as a **single machine-readable source of record** the gate reads (not prose in COUNTING.md). Owned by technical-writer. |
| Writer-prevents fix (tooth 1 — upstream, not this repo) | `gemba-xmr` / `fit-xmr` (and `gemba-wiki` at write time) fail **closed** (nonzero exit, name the offending line) on a ragged or unknown-`event_type` row, and quote notes per RFC-4180 at write time — never silent-drop + under-count `n`. The **durable / primary** lever. **Not repo-local**: routes to the shared-instrument maintainer (improvement-coach), obstacle #257. Named for completeness; not delivered by this spec's diff. |

**Out of scope:**

| Item | Why | Where it belongs |
|---|---|---|
| The upstream instrument fix (tooth 1) | Not repo-local; the instruments are compiled npm consumables with no extension point. | Shared-instrument maintainer (improvement-coach), obstacle #257. |
| Vendoring / mirroring the metrics CSVs into the main repo | `.gitignore` forbids the app repo tracking `wiki/` at all; a mirror is a drift copy. | Deliberately declined. |
| Retuning what counts as a valid `event_type` | This gate enforces the registry; it does not expand or curate it. | The technical-writer schema half / a future schema change. |
| The `--event-type='*'` over-read (obstacle #236) | A filter-semantics defect (prepends the pre-kata-shift era), not a parse-validity defect. | Obstacle #236 (improvement-coach). |
| Family-aware `(date, metric)` uniqueness / de-dup | A same-day-dup counting concern (COUNTING.md families), not a parse-validity concern. Note: the 2026-07-22 product-mix repair bundled such a dedup with the fixture-1 requoting; the fixture-1 acceptance test isolates **only** the three requoted ragged rows, not the dedup. | The upstream `gemba-xmr validate` path named in COUNTING.md § Enforcement ceiling. |
| A recording convention alone ("quote every note comma") | Unenforceable and will regress; the stopgap, not the fix. | Interim guidance only. |

## Constraints

- **Genuine CSV parse, never a heuristic.** The detector must use a real
  RFC-4180 CSV reader, **never** an `awk`/quote-presence sniff, which fails in
  lockstep with the analyzer (Problem fact 2). This is the Spec 110 soundness
  invariant, applied to parsing.
- **Single authoritative source, never a duplicated allowlist.** The gate reads
  the header contract and the `event_type` registry from one source of record. A
  duplicated allowlist is a drift vector — false-RED on a legitimately new name,
  green on a typo. Not theoretical: the ad-hoc name set used while scoping this
  work had **already drifted** — it omitted `monitor-spec-design` and
  `agent-skill` and invented a phantom `kata-storyboard` (verifiable against the
  live registry, which holds exactly the six names and no `kata-storyboard`).
- **All three conjunction legs are required.** Width-only misses a same-width
  corruption whose `event_type` slot still reads as a real name; registry-only
  misses width-changing corruption that leaves a valid `event_type` in place
  (fixture 2); and width∧registry together still miss a **count-preserving** shift
  that lands a real machine name in slot 7 while displacing garbage into the
  unconstrained `host_run` tail — the shape leg (typed anchors at columns 1/3/7)
  catches that by failing the `date`/`value` parse. No leg alone is sound, so the
  acceptance corpus must exercise **all three**. The date anchor must be the
  format-tolerant superset (calendar **or** ISO-8601), never a single-format pin,
  or legitimate rows false-RED.
- **Fail-closed LOUD, and name the line.** A bad row produces a nonzero exit and
  an error identifying the file and line. The gate must **never** silently drop,
  silently keep, or self-heal (auto-requote and continue) — a self-healing check
  is the same mask-the-condition class this repo rejects. It detects; it does not
  repair.
- **The gate must reach the files it protects — no false green, and no
  advisory-collapse as a passing outcome.** A passing result must mean the owned
  CSVs were actually parsed and validated, never that the check could not see
  them, found no files, or a tool was absent. The design resolves *which*
  reachable surface (SC7). If design instead finds **no** reachable surface, that
  is a **spec-invalidating discovery that returns 250 to scoping** — the deliverable
  does not ship as a green-but-blind check, and it is not satisfied by a doc note
  deferring to tooth 1.
- **Cannot-vet fails closed.** Because the only reachable surface reads a separate
  repo, a clone/checkout/parse failure is an inability to vet, not a clean pass:
  it fails the check RED. There is no fail-open-on-infrastructure-error path —
  the same posture Spec 100 holds for the secret scan.
- **Least privilege.** The check runs read-only — no write scope, no repository
  secrets beyond a read-only checkout of the wiki content — consistent with the
  least-privilege posture the other CI workflows adopted (#96, Spec 100).
- **Empty and new dirs are defined, not guessed.** A CSV with only the header row
  (zero data rows) is valid and passes. A metric directory that exists with no
  `2026.csv` yet is not itself a failure. The whole-set-absent case (no CSVs found
  where the owned set is expected) fails closed (SC4) — it must not read green by
  finding nothing.
- **Weaken no existing gate** (`check-audit`, `check-secrets`, `check-edge`,
  lint, typecheck, test, `coaligned`, smoke, and the sibling 110/220 gates should
  they land).
- **No over-claimed severity.** Measurement-integrity / recording hygiene; the
  gate fails builds on a malformed-row condition, but the finding class is not a
  security advisory.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A CI check parses each owned metrics CSV with a real CSV reader and fails RED, naming the offending file and line, on an invalid row | a seeded ragged row turns the check red and the log names its file:line |
| 2 | The validity test is the three-leg conjunction `(A) width == 8 + header-order` **AND** `(B) event_type ∈ registry` **AND** `(C) date parses (calendar or ISO) + value numeric`; the check fails when **any** leg is violated | a seeded 8-field row with an out-of-registry `event_type` (registry leg), a seeded ragged row whose `event_type` slot is still a valid name (width leg), **and** a seeded 8-field row with a valid `event_type` but a non-parsing `date` or non-numeric `value` (shape leg) **each** turn the check red |
| 3 | The check reads the header contract and the `event_type` registry from one machine-readable authoritative source, not a duplicated allowlist | the check reads the single source artifact; no second copy of the name set exists in the gate |
| 4 | A green result means the CSVs were actually parsed — the check cannot pass by finding no files (whole-set-absent), an absent tool, or a heuristic standing in for the parse | a change that hides the owned CSV set or disables the parse turns the check red, not green |
| 5 | The gate detects only — it never rewrites, requotes, or drops a row | the check makes no writes to any CSV; a bad row is reported, not repaired |
| 6 | The regression fixtures (below) are committed as the acceptance corpus and exercise **all three** conjunction legs and both failure directions, staying verifiable after the demonstrating repairs | the committed regression check runs in CI and covers all five fixtures |
| 7 | Reachability is resolved to a CI surface that reads the owned CSV set and fails RED on a bad row (feasibility already demonstrated by the pre-flight prototype). A finding of "no reachable surface" returns 250 to scoping; it is **not** a passing outcome | the design document and the check's trigger/target configuration |
| 8 | A clone/checkout/parse failure fails the check RED (cannot-vet is not a pass); the check runs read-only | an induced checkout/parse failure turns the check red; the workflow token grants no write scope |
| 9 | Edge inputs behave as defined: a header-only CSV passes; an empty/absent single metric dir is not a failure; the whole-set-absent case fails closed | seeded header-only and empty-dir cases pass; a hidden owned set turns the check red |

### Regression fixtures (the acceptance corpus)

Fixtures 1–3 are real defects found and repaired on the wiki repo 2026-07-22;
each corrupt state is reconstructed inline from the recorded row. The wiki
substrate squashes every write to one `wiki: update from session` commit and
retains no per-repair signal (#175), so the pre-repair rows are **not**
addressable by any wiki commit SHA — the tests seed the corrupt row from its
recorded state, keyed by `(directory, date/line)`, not from a SHA or the current
repaired file. Fixtures 4 and 5 are **synthetic** — the registry leg and the
shape leg respectively — because all three real defects were width-leg. Each
non-width leg needs its own seeded row so the conjunction is proven, not assumed.
The shape-leg row is synthetic for a second reason: a sweep of all 14
`wiki/metrics/*/2026.csv` found column 1 a calendar day and column 3 numeric
everywhere (the `T`-split lives in the quoted `run` field, never in `date`), so
there is **zero false-RED** and no real shape defect to reconstruct.

| # | Fixture | Defect | Leg / direction | Source |
|---|---|---|---|---|
| 1 | `metrics/product-mix/2026.csv` | 3 rows, unquoted note commas → extra fields; rows silently dropped → under-count (`n` 13→16 after repair) | **width** leg; under-count | product-mix, rows 07-07/07-08/07-11, repaired 2026-07-22 (isolate the 3 requoted rows only; not the same-day dedup the repair also carried) |
| 2 | `metrics/product-manager/2026.csv` line 30 | tail corruption → 10 fields, `event_type` slot still a valid name (`kata-shift`) → a **name-only** check would keep it; only the width leg rejects it | **width** leg over name-only; mis-count / over-read | product-manager, line 30, repaired 2026-07-22 |
| 3 | `metrics/kata-spec/2026.csv` line 4 | 2 unquoted note commas → 10 fields, row dropped → `specs_drafted` under-counted (`n` 16→17 after repair) | **width** leg on a Family-2 count metric; under-count | kata-spec, line 4, repaired 2026-07-22 |
| 4 | synthetic | 8 fields (valid width) with an out-of-registry `event_type` (the drifted phantom `kata-storyboard`) | **registry** leg | seeded (mirrors the real drift class the single-source constraint guards) |
| 5 | synthetic | 8 fields (valid width) with a valid `event_type` but a non-parsing `date` (col 1) or non-numeric `value` (col 3) — a count-preserving shift that A∧B alone would admit | **shape** leg | seeded (mirrors the width-preserving hole; no real defect — col-1/col-3 clean across all 14 CSVs) |

## Notes for design

- **Reachability first (SC7).** The pre-flight prototype already shows the shape
  is feasible: a main-repo scheduled / dispatch workflow that checks out the wiki
  repo at run time and validates `metrics/*/2026.csv`, failing the run RED and
  naming the line. That is the demonstrated candidate — a detector on main-repo
  CI, observable but not a pre-merge blocker (the wiki has no merge to block).
  Confirm it, or find a better reachable surface; do not ship a gate that reads
  green because it never saw the files, and do not silently downgrade to advisory.
- **Single source of record.** Name where the header contract and `event_type`
  registry live as one machine-readable artifact the gate reads (SC3). Coordinate
  with the technical-writer schema half; do not embed a second copy.
- **Sibling shape.** 110 (PR #122) and 220 (PR #231) carry a committed regression
  check CI exercises on `main` (as Spec 20 does with `audit-gate.test.js`). Follow
  that shape for SC6, sharing a design idiom where practical.
- **Fixtures seed corrupt rows.** The live CSVs are repaired; the acceptance tests
  reconstruct each corrupt row from its recorded provenance (fixtures 1–3) or seed
  it synthetically (fixture 4), not from the current clean file.

— Security Engineer 🔒
