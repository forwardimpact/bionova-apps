# spec(140): Cross-trial enrollment-interest overview

Serves issue #128. Classification: **product-aligned**. It delivers the
comparative half of a named Clinical Development Staff Little Hire that the
shipped surface answers only one trial id at a time.

## Problem

The Clinical Development Staff Little Hire is "watch which trials are drawing
enrollment interest" (JTBD.md, _Keep Listings True_). The hire is inherently
plural and comparative — "watch **which trials**" — but the shipped surface
answers it only one trial id at a time.

Evidence (by behaviour or entity, not `file:line`):

- Interest aggregation lives only inside `manageTrial`, which requires a single
  `id` argument and a staff token. It returns the eligible / possibly-eligible /
  not-eligible / total buckets for that one trial.
- The only surfaces that reach `manageTrial` are the CLI verb `admin trial <id>`
  and the single Next admin route `admin/trials/[id]`. Both take a specific
  trial id. There is no admin trials index or portfolio route.
- The staff console sidebar's "All trials" link points at the patient `search`
  page, not a staff interest overview. No cross-trial rollup exists anywhere;
  `manageTrial` is the only aggregation.
- The underlying data already supports a cross-trial read. `interest_signals`
  carries `trial_id`, `match_score`, and `created_at`, and its RLS grants a
  staff-role SELECT across all rows (`interest_signals_staff_read`). Nothing but
  a surface is missing.

So to "watch which trials are drawing interest," a staffer must already hold
every trial id, open each per-trial view in turn, and hold the comparison in
their head. The comparison the job is named for has no surface.

## Users and jobs

| Persona | Job | Why a cross-trial overview matters |
| --- | --- | --- |
| Clinical Development Staff | "Keep Listings True" — Little Hire: watch which trials are drawing enrollment interest | The Pull is prioritization: seeing where interest concentrates so coordinator attention follows demand. Per-trial lookups keyed by ids the staffer must already know defeat that; the "do nothing until someone complains" competitor wins. |
| Patient / Advocate | — | Out of scope. Interest signals are staff-only; the overview is never patient-facing. |
| Referring Physician | — | Out of scope. |

## What (scope)

Provide a staff-only overview that lists every trial in the seeded world with
its interest-signal aggregates, answerable in one read without supplying or
knowing any trial id in advance. The overview is available on the same two
staff surfaces the per-trial view already uses: the CLI and the web admin
console.

In scope:

- A staff-authenticated read that returns, for every trial — including trials
  with no interest yet, which appear with all-zero aggregates — the trial's
  identity and its interest aggregates (eligible / possibly-eligible /
  not-eligible / total) in one read that takes no trial id. `trials` is the
  driving set; interest signals attach to it, so a trial with zero signals is
  still listed. The overview reads no new table and widens no grant.
- A staff CLI invocation that renders this overview and takes no trial id.
- A staff web surface that renders this overview, takes no trial id, and links
  each trial into its existing per-trial view for depth. The web route topology
  and the CLI verb spelling are the design's call.
- An ordering that surfaces where interest concentrates — trials read primarily
  by interest volume, most-interest-first, not by id or an arbitrary order. The
  order must be deterministic: the design names the exact ordering rule and a
  stable tie-break for trials of equal volume.
- The same staff gate and output-encoding the per-trial view already sits
  behind.

## Non-goals

- **No new interest capture.** The overview is a read-only rollup: it reads
  every trial and reports the interest signals already recorded against it
  (zero where a trial has none). It adds no writable table, no new column, and
  no story.dsl edit.
- **No schema or RLS change.** The staff SELECT across `interest_signals`
  already exists. The overview consumes it; it does not widen it.
- **Not per-trial criteria depth.** Enriching the single-trial staff view with
  custom-criteria legibility and a listing-currency marker is spec 70 — a
  different data domain (criteria rows, not interest signals). This spec is
  interest breadth: a portfolio index that links into the per-trial view rather
  than duplicating it.
- **Not criteria currency or correction.** _Keep Listings True_ splits three
  ways. Watching where interest concentrates is this spec (over
  `interest_signals`). Detecting stale criteria and routing a correction is
  specs 70 and 130 (over criteria rows). This spec touches only interest
  signals and never criteria.
- **Not patient-facing.** Interest signals stay staff-only. The overview has no
  anonymous or patient surface.
- **Not the stackless read path.** Spec 120 offlines the four demand-side read
  commands only; this staff read stays behind the live stack, consistent with
  spec 120's stated non-goal.

## Why

The named Little Hire is comparative, and today its comparative form has no
surface. A staffer can answer "how is *this* trial doing" but not "*which*
trials are drawing interest" without already knowing every id and comparing by
hand. Because the seeded world holds only a few trials (six today) and the staff
SELECT already spans them, the gap is a missing view, not missing data. Closing
it lets coordinator attention follow demand — the Pull the job names — instead
of waiting until someone complains.

## Inputs (not blockers)

- Spec 80 (staff-token auth, PR #81) and spec 90 (output-encoding / CSP,
  PR #87): the overview sits behind the same staff gate and inherits the same
  encoding. Sequence after them where the surfaces overlap, but do not block on
  them.
- Spec 70 (per-trial staff criteria view): complementary, not a dependency.
  #128 is interest breadth (a portfolio index over interest signals); 70 is
  per-trial criteria depth (over criteria rows). Different data domains — the
  overview links into the same per-trial view 70 enriches, without duplicating
  it.

## Success criteria

1. A staff-authenticated overview call that supplies no trial id returns every
   seeded trial with its four interest aggregates (eligible, possibly-eligible,
   not-eligible, total), including trials with zero interest signals, which
   appear with all-zero counts. Verify by invoking the overview with a staff
   token, seeding at least one trial with no interest signals, and asserting
   every seeded trial appears — the zero-signal trial with all-zero counts.
2. The overview is answerable without knowing ids in advance: neither staff
   surface accepts or requires a trial id. Verify by confirming the CLI
   invocation and the web surface each return the overview with no id supplied.
3. Each trial's aggregate in the overview equals the per-trial `manageTrial`
   signals for that same id, for every seeded trial. Verify by cross-checking
   each trial's overview row against its per-trial signals. This oracle is the
   shipped per-trial aggregation, so it catches any drift in the counting rule —
   distinct from criterion 1, which checks the read itself.
4. The overview orders trials primarily by interest volume, most-interest-first,
   so concentration is legible, and the order is deterministic — a documented,
   stable tie-break resolves trials of equal volume. Verify by seeding at least
   two trials with different interest volumes and asserting the rendered order
   follows interest volume, not id, and that equal-volume trials fall in the
   design's documented tie-break order.
5. Without a staff token the overview returns an unauthorized state, not data —
   matching the per-trial gate. Verify by calling the overview with no token and
   asserting it errors or renders the staff-access-required state rather than
   returning aggregates.
6. The overview adds no new writable table, no `interest_signals` schema or RLS
   change, and no story.dsl edit. Verify by inspecting the migrations and the
   story.dsl diff.

— Product Manager 🌱
