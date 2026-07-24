# design(180): Metric definition-of-ready

Scope: the WHICH/WHERE for spec 180. The spec fixes the five readiness clauses
and the check's obligations; this design places the contract, shapes the check,
and settles what it reads. Grounded in RFC #170's existing metrics home.

## Components

1. **The contract** — a `## Definition-of-ready` section appended to
   `wiki/metrics/COUNTING.md`. Five clauses, each a one-line rule plus its cited
   precedent. Prose, not code: it is a discipline a metric owner applies at
   seating and a reviewer applies at spec/experiment review.
2. **The readiness check** — `wiki/metrics/check-readiness.sh`, a sibling of the
   existing `wiki/metrics/check-counting.sh`. Reads every `wiki/metrics/<dir>/`
   and its `2026.csv` + family assignment, applies the mechanically-checkable
   clauses, prints one line per metric: `<dir>/<metric> READY` or
   `NOT-READY: <first failing clause>`.
3. **Per-metric family files** — unchanged in shape (RFC #170's thin pointer).
   The check reads the family assignment already recorded there to know each
   metric's expected event-type and shape.

## Where each clause is read

The five clauses split by how far a script can decide them. The check decides
what a CSV can prove; the contract carries the rest as review discipline.

| Clause | Cited | Mechanically checkable? | How the check reads it |
| --- | --- | --- | --- |
| Ingested producer | #145 | Yes | `analyze --event-type` on the series returns `n_ingested > 0`; if the family's event-type yields 0 rows, NOT-READY. |
| Standing producer + cadence | #15 | Partly | The `2026.csv` has ≥1 row dated within the metric's stated cadence window (a hand-sampled metric has stale/absent rows). |
| Control-capable shape | #40 | Yes | Moving-range over the series is not ≈0 across all points (a flatline → degenerate limits → NOT-READY). |
| Single population | #166 | No | The family file states one population in one line; the check asserts the line exists and is non-empty, review judges its content. |
| Stable baseline | #135 | No | Ratio metrics declare their denominator basis in the family file; the check asserts the declaration exists, review judges drift. |

## Key decisions

**D1. Extend `COUNTING.md`, do not create a new doc.** RFC #170 already made
`wiki/metrics/COUNTING.md` the canonical, in-force metrics home and defined the
three families the readiness check needs. A second top-level doc would split the
"read this before you quote a series" surface #170 deliberately unified.
*Rejected:* a standalone `READINESS.md` — reintroduces the per-surface sprawl
#170 closed, and readiness+counting are read at the same moment (seating a
metric).

**D2. One check script beside `check-counting.sh`, not a fit-xmr change.** The
readiness check is repo-local discipline over repo-local CSVs; it composes the
existing `fit-xmr analyze` output rather than asking for a new tool knob. This
keeps #145's analyzer behaviour framed as a *contract the producer must meet*
(spec non-goal), not a tool fix this repo cannot land. *Rejected:* patch
`fit-xmr analyze` to ingest all event-types — that is the upstream libxmr
`--event-type='*'` knob already tracked in MEMORY; it would mask the contract
rather than enforce it, and this repo does not own the binary.

**D3. Split clauses into machine-checked vs review-discipline, do not force all
five into the script.** Ingested-producer, cadence, and shape are decidable from
the CSV; single-population and stable-baseline require judging the *meaning* of a
definition, which a script cannot do without manufacturing false confidence. The
check asserts the *declaration exists* (a one-line population statement, a
denominator basis) and leaves the judgment to spec/experiment review. *Rejected:*
a regex "population classifier" — would green-light a badly-worded definition and
recreate #166's "the number does not mean what its name implies" with a check
that lies.

**D4. The check reports; it never edits, deletes, or retargets a metric.**
Naming a metric NOT-READY is a finding routed to its owner (spec non-goal:
no metric deleted here). This preserves each agent's ownership of its own
storyboard series and avoids the coach reaching into another domain's
instrumentation. *Rejected:* auto-pruning not-ready metrics from the storyboard —
a cross-domain write the coach has no mandate for, and destructive before the
owner has seen the finding.

**D5. Ground clause 3 (SC#3) on the two live NOT-READY exemplars.** The check
must reproduce `docs_staleness_age_days`→ingested-producer (#145) and
`main_ci_failing_checks`→standing-producer (#15) as NOT-READY, and pass at least
one genuinely signal-capable metric, so the check is validated against known
truth, not asserted. *Rejected:* a synthetic fixture — a fixture proves the
script runs, not that it reproduces the real defects the corpus documented.

## Data flow

```
wiki/metrics/<dir>/COUNTING.md   ── family assignment (event-type, shape) ─┐
wiki/metrics/<dir>/2026.csv      ── series rows ─────────────────────────┐ │
                                                                         ▼ ▼
                                              check-readiness.sh (composes fit-xmr analyze)
                                                                         │
                                        per-metric: READY | NOT-READY: <clause>
                                                                         │
                              ┌──────────────────────────────────────────┘
                              ▼
        machine clauses (ingested / cadence / shape) decided from CSV
        declaration clauses (population / baseline) assert the line exists → review judges
```

## What this does not touch

- No change to `analyze()` / fit-xmr (D2). The `--event-type='*'` knob stays a
  MEMORY-tracked interim, not a dependency of this spec.
- No change to RFC #170's counting families, dedup, or n-rules — readiness is
  strictly upstream (spec non-goal).
- No metric retargeted or retired: `product_share` (#135) and
  `docs_pages_over_ceiling` (#110) dispositions stay their owners' calls.
- The approval-signal cluster (spec 160) is untouched.

## Corpus precedents (cited, not closed by this design)

The active experiments each invented one clause's repair move and are the cited
precedents the contract generalizes; they stay open as live countermeasures:
#167 (single-population split), #20 (standing producer), #110 (control-capable
shape), #146 (ingestion workaround), #153 (rebaseline), #154 (point-accrual),
#42 (producer cadence).
