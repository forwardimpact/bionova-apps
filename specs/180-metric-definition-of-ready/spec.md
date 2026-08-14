# spec(180): Metric definition-of-ready — a producer-to-signal contract

Serves issues #145, #166, #135, #15, #40. Classification: **internal**
(instrumentation discipline). It consolidates a recurring backlog pattern: a
storyboard metric that cannot carry a control signal, discovered one metric at a
time, each fixed with a bespoke workaround.

Backlog-synthesis sweep, ISO week 2026-W28. Corpus: the OR-union of open
`obstacle` + `experiment` issues (52 items); this spec is the metric-contract
cluster. Complementary to RFC #170 (`wiki/metrics/COUNTING.md`, in force), which
governs counting a series *after* it is valid; this spec governs whether a series
can carry a signal *before* it is seated.

## Problem

Every storyboard target reads through an XmR series backed by a
`wiki/metrics/<dir>/2026.csv` producer and rendered by `fit-xmr analyze`. When a
target stalls, the recurring root cause is not the underlying work — it is that
the metric was seated on the storyboard without ever proving it can carry a
control signal. Five distinct failure modes have each been discovered
independently, in the metric's own body, after the metric was already a headline:

- **Producer not ingested (#145).** `docs_staleness_age_days` rows are recorded
  `agent-shift` / `agent-storyboard`, but `analyze()` slice-filters CSV rows to
  `event_type=kata-shift` before grouping. Zero of the series' rows are ingested,
  so the block renders "Insufficient data" no matter how many rows exist. The
  producer emits; the analyzer silently drops. No producer→analyzer event_type
  contract was ever asserted.
- **Definition conflates two populations (#166).** `open_prs_awaiting_gate` read
  0→9 as a growing release backlog, but decomposing the 9 showed all were
  signal-blocked (awaiting a human `spec approved`), none gate-actionable. One
  name spanned two populations, so "the number does not mean what its name
  implies."
- **Baseline drifts under measurement (#135).** `product_share` =
  `product / (product + internal)`. The 30% target was baselined when the
  denominator was small; internal has since doubled (14→29), so 30% now measures
  something product throughput alone cannot reach. The target was set against a
  moving baseline.
- **No standing producer (#15).** `main_ci_failing_checks = 0` is known only from
  a manual `gh run list` during the storyboard. No mechanism records the reading
  on a cadence, so "zero red-days" is assumed between manual glances, not earned.
  A red-day could open and close unseen.
- **Shape cannot carry a signal (#40, #110).** `docs_pages_over_ceiling` is a
  one-time backlog burn-down. Once drained it flatlines at 0; an XmR chart on a
  flatline has moving-range ≈ 0 and computes degenerate limits, so the series can
  never carry a live control signal — accruing points on it yields nothing.

Because no gate names these conditions, each was found late and repaired
per-case: a prose reading routed around the broken pipeline (#146), one metric
swapped for another (#110), points accrued on a substitute series to dodge the
ingestion defect (#154), a metric rebaselined on an event (#153), a conflated
metric split after the fact (#167). The moves rhyme; the discipline has no home.

## Users and jobs

| Persona | Job | Why a definition-of-ready matters |
| --- | --- | --- |
| Any domain agent (metric owner) | "Seat a target on the storyboard and steer by it" | A metric that renders green/insufficient/misleading gives no steer; the owner discovers the defect only after the target has stalled a month. |
| Improvement coach (facilitator) | "Read a real current condition from the storyboard" | The five-question protocol needs a Q2 that means what it says; a conflated or unfed metric makes the current condition unknowable. |

## What (scope)

Add a **metric definition-of-ready**: a small, checkable contract a series must
satisfy before it is seated as a storyboard signal, plus the check that reads it.

In scope:

1. A definition-of-ready with these clauses, each grounded in a cited failure
   mode. A candidate metric is ready only when all hold:
   - **Ingested producer** — the producer's rows pass `analyze()`'s
     event_type slice-filter for the configured event-type, so `n_ingested > 0`
     (#145).
   - **Single population** — the operational definition names exactly one
     population, stated so a future shift classifies a row identically (#166).
   - **Stable baseline** — for a ratio or target-relative metric, the baseline
     the target is set against does not drift under the measurement, or the
     target is restated against a fixed denominator (#135).
   - **Standing producer + cadence** — a defined mechanism records the point on a
     stated cadence; the value is not sampled by hand (#15).
   - **Control-capable shape** — the series can carry a control signal: it is not
     a one-time burn-down that flatlines into degenerate limits (#40).
   - (Assumed downstream: once ready, the series is counted per RFC #170's family
     rules. Readiness is upstream of counting, not a restatement of it.)
2. A check that reads the contract for every metric already seated (each
   `wiki/metrics/<dir>/` family assignment) and reports, per metric, ready or the
   first failing clause. The WHAT is that a not-ready metric is named as such
   before it is trusted as a signal; the check's location and mechanism are the
   design's call.
3. A home for the contract. The design chooses whether it extends
   `wiki/metrics/COUNTING.md` (RFC #170's canonical metrics doc) or sits beside
   it; the WHAT is one canonical, discoverable home, not per-metric prose.

## Non-goals

- **Not a re-litigation of counting.** RFC #170 owns the counting unit, same-day
  dedup, and family assignment. This spec does not change how points are counted;
  it gates whether a series is signal-capable before that.
- **No metric is deleted or retargeted here.** Naming a seated metric not-ready
  is a finding for its owner, not an automatic removal. Retargeting
  `product_share` (#135) or retiring `docs_pages_over_ceiling` (#110) stays the
  owning agent's call, informed by the check.
- **The approval-signal cluster is out of scope** (#178/#164/#43/#39 and kin).
  Those are converging via spec 160; this spec touches only metric instrumentation.
- **Not a new fit-xmr feature.** The analyze() slice-filter behaviour (#145) is
  read as a contract the producer must meet, not a tool change requested here.

## Why

Five metric owners — technical-writer, release-engineer, product-manager,
security-engineer, improvement-coach — each independently found their headline
metric could not carry a signal, and each invented a private workaround. RFC #170
already proved the sibling case (n-inflation was one systemic recording-hygiene
defect, not five) and gave metrics a canonical home. This spec closes the
upstream gap #170 leaves open: a metric can be counted perfectly and still be
unable to carry a signal. One definition-of-ready, applied before a metric is
seated, would have surfaced every one of #145/#166/#135/#15/#40 at seating time
instead of a month later.

## Success criteria

1. `wiki/metrics/` carries a single canonical statement of the metric
   definition-of-ready with all five clauses, each traceable to a cited issue,
   discoverable from the same place as RFC #170's counting convention.
2. A check enumerates every seated metric (every `wiki/metrics/<dir>/` family
   assignment) and reports, per metric, ready or the first failing clause; it
   runs without a live Supabase stack.
3. Run against today's metrics, the check reproduces the known findings: it flags
   `docs_staleness_age_days` on the ingested-producer clause (#145) and
   `main_ci_failing_checks` on the standing-producer clause (#15), and passes at
   least one metric that is genuinely signal-capable.
4. A metric that passes all five clauses and is then counted per RFC #170 renders
   a real XmR status (not "Insufficient data" for a reason the contract would
   have caught).
5. The definition-of-ready states its own relationship to RFC #170 in one line:
   readiness gates signal-capability; #170 gates counting; a metric needs both.
