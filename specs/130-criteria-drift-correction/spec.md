# Spec 130: Staff criteria-drift correction request

**Classification:** Product — serves the Clinical Development Staff persona's
listing-accuracy job. It gives staff a shipped path to act on a stale eligibility
criterion, which is the core of that job; it is not internal tooling.

**Persona / job:** Clinical Development Staff — *Keep Listings True* (Big Hire):
*"Help me keep public trial listings matching the current protocol,"* its Trigger
(*"a trial's eligibility criteria change and the listing patients see is suddenly
stale, drawing screening calls that go nowhere"*), its Pull (*"confidence the
public listing reflects the protocol in force today"*), the Habit it must break
(*"treating the external registry as the system of record"*), and its Anxiety
(*"an automated sync might publish a wrong criterion"*). ([JTBD.md](../../JTBD.md))

## Problem

The staff job exists to fix one thing: eligibility-criteria drift. Its Trigger is
a criterion that has gone stale and is drawing screening calls that go nowhere.
The shipped staff surface can neither show those criteria nor act on them: the
staff trial read fetches the criteria rows from the store, but no shipped staff
surface renders them, and no write path can change them.

`manageTrial` is the only staff write path (CLI `admin trial <id> --update`, web
admin trial page), and it already fails closed without a token. Its update
allowlist covers `status`, `current_enrollment`, `estimated_end_date`, and
`arms`. A trial's eligibility criteria — its `inclusion` fields (`age_min`,
`age_max`, `conditions_required`, `ecog_max`) and the `custom[]` clinical
free-text rules on both `inclusion` and `exclusion` — are read back at the data
layer but never patchable, and a key outside the allowlist is silently dropped.
So a staff member who learns a trial's age range or a `custom[]` rule has gone
stale has no shipped way to correct the criteria that are generating the wrong
screening calls. They can change the enrollment count and the end date; they
cannot touch the criteria.

This is the *correction* half of the job: a path from *"I see this criterion is
stale"* to *"the patient-facing listing is true again."* Today no such path
ships, so the Habit the job must break is reinforced — editing the external
registry by hand (a listed Competitor) remains the only place a criterion can
actually be changed, and the Pull is unreachable through the product. (The
*detection* half — telling staff *whether* a listing is stale and rendering its
criteria on a staff surface, which none does today — is the companion spec 70,
scoped out here per X4.)

**Why the obvious fix is the wrong one.** Making criteria editable in the app
looks like the direct answer and is not. Polaris renders every listing from
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl), vendored verbatim
and SHA-guarded; the database is a projection of it, and the daily
`sync-listings` job re-upserts trials and criteria from the seed. A criterion
edit written to the database would be silently reverted on the next sync. Worse,
[`data/synthetic/PROVENANCE.md`](../../data/synthetic/PROVENANCE.md) states that
editing the vendored DSL is out of scope — domain changes are made in the
upstream monorepo and re-vendored — so this repository does not own the source
the correction must reach. An editable database path would create a second source
of record, clobbered by the next `build-seed.sh`, and could not be applied here
even in principle. A correction that quietly un-fixes itself on a screening field
is worse than the gap it closes. The correction must terminate at the source of
record, not at a live database row.

## Scope

This spec defines a **staff-initiated correction-request workflow**: a way for
staff to flag a specific trial's criterion as stale, propose the corrected value,
and emit a durable, structured correction request routed toward the source of
record (the upstream `story.dsl` re-vendor). It is a path from *"this is stale"*
to *"a correction is in flight,"* not a dead-end alert and not a live editor.

**What "a criterion" means here.** A trial's criteria are stored as one row per
trial holding two structures, `inclusion` and `exclusion`; individual criteria
carry no standalone identity. So a correction targets a **named field within
that structure** — one of the structured fields (`inclusion.age_min`,
`inclusion.age_max`, `inclusion.ecog_max`, `inclusion.conditions_required`) or
one free-text `custom[]` rule identified by the half it lives on and its position
in that array (for example, `inclusion.custom[2]`). This naming scheme is the
correction's unit of work; how it is encoded is a design decision.

The workflow reuses the shipped authenticated `manageTrial` write path — which
fails closed without a token at the handler and gates the staff role at the
database (RLS) — and composes with spec 70's detection surface (which criterion
is stale). It records intent only; it never mutates the live `trials` or
`criteria` rows and never touches any patient-facing view. Any proposed value the
workflow renders back to staff is output-encoded like the rest of the staff
surface; this is the one hardening obligation the request path carries, and it is
in scope.

**The cost this workflow carries, stated plainly:** the correction is not
instant. Because the source of record is upstream and re-vendored, *"true again"*
means *"corrected at the source and reflected on the next render"* — a latency of
one vendor-and-render cycle. An instant live correction is exactly the
editable-database path the single-source invariant forbids; this spec does not
provide one and must not imply it.

In scope:

| # | The correction-request workflow will… |
| --- | --- |
| S1 | Let staff initiate, against a specific trial and a specific named criterion, a correction request that captures the current value, the proposed corrected value, and a free-text reason. |
| S2 | Record each accepted request as a durable, staff-scoped entry that no later request overwrites, capturing the identity the request token carries, when it was raised, the target trial and criterion, and the current-versus-proposed values — a change record for a clinical screening field. The recorded identity is whatever the authenticating token presents; on a surface authenticated by a shared credential (the CLI service-role key today) that identity is the shared one, not a distinct person, so the record proves *what changed and when*, and *who* only to the granularity the surface's credential provides. |
| S3 | Validate a proposed correction against the shape of the target criterion before recording it, so no malformed correction enters the request store. A proposed age range must satisfy `age_min ≤ age_max` with both a non-negative integer; a proposed `ecog_max` must be a non-negative integer; a proposed `conditions_required` must be a list of well-formed condition ids; the free-text `custom[]` rules carry no structural constraint and are recorded as given. The age check is the load-bearing case because those bounds feed the patient eligibility pre-check directly. |
| S4 | Record each request so that the target trial, the target criterion (per the naming scheme above), and the proposed value are each an independently addressable field — not a single free-text blob — so a human can apply it as a `story.dsl` change upstream without re-keying it. |
| S5 | Leave the live listing unchanged on submit: it mutates no `trials` or `criteria` row and no patient-facing view; the listing changes only when the correction is applied at the source and re-rendered. |
| S6 | Be staff-only: initiating a request, and reading the request log, require a staff token; neither is reachable from any patient-facing surface. |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | In-app editable criteria — patching live `criteria` rows from the staff view. | Creates a second source of record clobbered by the next `sync-listings` / `build-seed.sh`, cannot be applied in this repo (PROVENANCE.md), and silently rolls back the correction — reintroducing the exact stale listing the job exists to kill. |
| X2 | Automated sync or drift-diff against an external registry. | The job's Anxiety — *an automated sync might publish a wrong criterion* — disqualifies auto-application, and this synthetic world has no external protocol feed to diff against. Every correction is human-initiated and human-reviewed at the source. |
| X3 | Applying the correction to `story.dsl` inside this repository. | The vendored DSL is byte-identical from upstream; domain changes are authored in the monorepo and re-vendored (PROVENANCE.md). The request routes there; it is not applied here. |
| X4 | Detecting *whether* a listing is stale, or the currency marker and published-criteria display. | That is the detection half, spec 70. This spec is the correction half and composes with it; it does not re-implement detection. |
| X5 | Stored-XSS hardening of `custom[]` on the **public patient page**. | The correction request is staff-only and never renders on the public patient page, so `custom[]` there stays trusted-generated content and that concern dissolves. |
| X6 | The Patient / Advocate and Referring Physician jobs. | This spec serves the Clinical Development Staff job only. |

## Success criteria

Each is a claim plus the command or path that verifies it. The automated tests
below run under the repository test harness (`just test`), exercising the seeded
trial `oncora-phase3` (ONCORA-301), whose criteria the sync publishes. Which
layer hosts each assertion is a design decision; the criteria name the behavior
to assert, not the file that asserts it. Where a criterion names a seeded value,
it asserts the field is present and well-formed, not a re-vendorable exact value.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | Staff can raise a correction request against `oncora-phase3` for a named criterion, capturing current value, proposed value, and reason. | An automated test that submits a correction request for a named `oncora-phase3` criterion with a proposed value and reason, and asserts the request is accepted and retrievable with all three fields intact. |
| C2 | Each accepted request is recorded as a durable, staff-scoped entry that a later request does not overwrite, carrying the token identity, when, target trial, target criterion, and current-versus-proposed values. | An automated test asserting that after two corrections are raised against `oncora-phase3`, both entries persist independently (neither overwrites the other) and each carries the recorded token identity, timestamp, trial, criterion, and both values. |
| C3 | A proposed age correction that violates `age_min ≤ age_max` (or is negative or non-integer) is rejected and never recorded; a proposed `ecog_max` that is negative or non-integer is likewise rejected. | An automated test submitting a proposed age range with `age_min > age_max` and asserting the request is rejected with a validation error and no entry is written; companion tests asserting a valid age range and a valid `ecog_max` are accepted and a negative `ecog_max` is rejected. |
| C4 | Submitting a correction request mutates no live listing and no patient-facing view. | An automated test asserting that after a correction request is raised for `oncora-phase3`, the trial's stored `criteria` values are unchanged (value-equal to before) and the patient-facing trial view renders the same criteria as before. |
| C5 | Each request exposes the target trial, the target criterion (per the naming scheme), and the proposed value as three independently addressable fields, suitable for a human to apply upstream without re-keying. | An automated test asserting the recorded request exposes the target trial id, the target criterion name (e.g. `inclusion.age_min` or `inclusion.custom[2]`), and the proposed value as three separate retrievable fields — reading each field back independently — and that none of the three is recoverable only by parsing a free-text blob. |
| C6 | The workflow is staff-only: raising a request and reading the log both require a staff token, and neither is reachable from a patient surface. | An automated test asserting an anonymous (no staff token) call to raise or read a correction request is refused, and a patient-facing trial-view test asserting it exposes no correction-request entry point or log. |

## Dependencies and relationships

Both sibling specs below are **in flight, not yet on `main`**. Neither is a hard
prerequisite: the authorization path S6 reuses already ships today, and the
correction workflow can be built against it independently.

- **Spec 70 (listing-currency confidence)** is the detection half: it surfaces
  *whether* a listing is stale and adds the published-criteria display to the
  staff view. This spec is the correction half. The two compose — spec 70 tells
  staff a criterion is wrong; spec 130 lets them route a fix — but spec 130 does
  not require spec 70 to ship first: a staff member can raise a correction
  request against any named criterion independent of the currency marker.
- **Staff-token authorization** already ships: the `manageTrial` path fails
  closed without a staff token today, and S6 reuses that shipped check. Spec 80
  (edge-function authz), also in flight, hardens and formalizes that boundary;
  spec 130 rests on the shipped check, not on spec 80 landing. The
  correction-request write stays on the authenticated path and introduces no new
  unauthenticated route.

— Product Manager 🌱
