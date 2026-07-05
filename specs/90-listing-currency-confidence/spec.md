# Spec 90: Listing-currency confidence for Clinical Development Staff

**Classification:** Product — serves the Clinical Development Staff persona's
listing-accuracy job; changes what staff can see and trust on the staff trial
view, not internal tooling.

**Persona / job:** Clinical Development Staff — *Keep Listings True* (Big Hire):
*"Help me keep public trial listings matching the current protocol,"* its Push
(*"stale listings waste coordinator time on unqualified screening calls"*), and
its Anxiety (*"an automated sync might publish a wrong criterion"*).
([JTBD.md](../../JTBD.md))

## Problem

A member of clinical development staff is responsible for the public listing of
a trial. Polaris renders every listing from `data/synthetic/story.dsl` through a
seed build, and a scheduled `sync-listings` job upserts the trial and criteria
rows once a day. Staff have a dedicated view of a trial — the staff trial view
behind `manageTrial`, shown on the admin trial page — but it tells them nothing
about whether the public listing in front of a patient is current, or whether
the automated sync published the eligibility criteria the protocol actually
says. The job's Pull — *confidence the public listing reflects the protocol in
force today* — has no surface, and the job's Anxiety about a wrong-criterion
sync is left entirely unaddressed.

Evidence, in the shipped surface today:

| Where | What staff get | Why it fails the job |
| --- | --- | --- |
| Staff trial view (`manageTrial`, the admin trial page) | The `manageTrial` response carries the trial row with nested criteria, sites, and conditions plus interest-signal counts by match score; the admin trial page renders the trial name, status, enrollment, and the interest-signal summary. | Neither the response nor the page carries any signal of when the stored listing was last refreshed from the protocol source, so staff cannot tell whether they are looking at today's protocol or a stale one — and the page does not surface the criteria at all, so staff cannot even see the eligibility rules the public is being shown. |
| The daily sync (`sync-listings`) | Upserts the newest seeded `trials` and `criteria` rows and returns only `{ trials_upserted, criteria_upserted, dry_run }` — aggregate counts, discarded after the response. | Nothing is recorded per trial about *when* its listing was last synced or *what* was published, so no downstream surface can show a listing's currency even if it wanted to. |
| Any staff surface | There is no view that confirms the eligibility criteria the public sees, framed as "this is what the sync published." | The Anxiety the job names — *an automated sync might publish a wrong criterion* — has no surface to catch it. Staff learn a criterion is wrong only when a screening call goes nowhere, which is the Push the job is hired to remove. |

The listing data staff need to trust already exists — the synced trial row, its
criteria, and the seed build that is the protocol source of record in this
world. What is missing is a record of *when* the sync last refreshed each
listing and a staff-facing view that surfaces that currency alongside the
published criteria, so staff can confirm the public listing is current and
correct. This spec defines that record and that view.

## Scope

Grounded in the trial listing Polaris already stores and renders — the `trials`
and `criteria` rows synced from
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) by the
`sync-listings` job, and read back by the `manageTrial` staff view on the admin
trial page. This spec adds a per-listing record of when the sync last refreshed
it, and a staff-facing currency surface on the staff trial view that reads that
record. Where the record is stored, how the sync writes it, and how the view
renders currency are design decisions.

The surface is **staff-only**. It changes what `manageTrial` returns and what the
admin trial page shows; it does not change any patient-facing view. The Little
Hire — *watch which trials are drawing enrollment interest* — is already served
by the interest-signal summary on the same view and is out of scope here.

In scope:

| # | The listing-currency surface will… |
| --- | --- |
| S1 | Record, when the sync refreshes a listing, **when that listing was last synced** from the protocol source — a per-listing marker that outlives the sync response, so currency is derived from a real record and never invented by the view. |
| S2 | Surface on the staff trial view **when the listing was last refreshed** from the protocol source, in staff-readable terms, so staff can tell at a glance whether they are looking at today's protocol. |
| S3 | Distinguish a **current** listing from one that is **overdue** — one that has not been refreshed within the expected sync cadence — so staff can act on a stale listing rather than assume it is fresh. The cadence threshold is a design decision. |
| S4 | Present the trial's **eligibility criteria as published to patients** — the inclusion and exclusion criteria exactly as the sync stored them — framed so staff can confirm the sync published the protocol the trial is running under, directly tempering the Anxiety about a wrong-criterion sync. |
| S5 | Be **staff-only** and read-only: it reports currency and published criteria; it does not change the patient-facing listing and adds no new editable field. |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | Diffing the listing against an external registry (ClinicalTrials.gov or a sponsor system). | There is no external source of record in this world; the seed build is the protocol source. Currency here means "matches the latest synced protocol source," not "matches a third party." |
| X2 | Triggering an on-demand sync, or any control that re-runs `sync-listings` from the view. | This spec makes the current state *visible*; acting on staleness by forcing a sync is a follow-on once the currency signal exists. |
| X3 | Editing criteria from the staff view. | Criteria flow only from the seed source through the sync; hand-editing them on the view would fork the listing from its source and violate the single-source invariant. Staff's existing `manageTrial` patch surface (status, enrollment, end date, arms) is unchanged. |
| X4 | Enrollment-interest analytics — trends, view counts, per-channel engagement. | That is the Little Hire, already served by the interest-signal summary, and is a separate spec. |
| X5 | Hand-authoring any domain content or criterion prose. | Violates the no-hand-authored-domain-content invariant (CLAUDE.md). The surface composes the synced listing and a sync timestamp only. |
| X6 | The Patient / Advocate and Referring Physician jobs. | This spec serves the Clinical Development Staff job only. |

## Success criteria

Each is a claim plus the command or path that verifies it. Automated tests are
the primary verifiers, exercising the seeded trial `oncora-phase3` (ONCORA-301),
whose trial and criteria rows the sync publishes. Which layer hosts each
assertion is a design decision; the criteria below name the behavior to assert,
not the file that asserts it.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | When the sync refreshes a listing, it records a per-listing last-synced marker that persists after the sync response returns and is readable independently of it. | An automated test asserting that after a non-dry-run sync of `oncora-phase3`, a per-listing last-synced marker for that trial is readable independently of the sync response — the marker exists in stored state, not only in the aggregate `{ trials_upserted, criteria_upserted }` counts the sync returns. |
| C2 | The staff trial view exposes, for `oncora-phase3`, when its listing was last refreshed from the protocol source. | An automated test asserting the staff view for `oncora-phase3` surfaces a last-refreshed value read from the C1 marker, presented alongside the existing trial and interest-signal content. |
| C3 | The staff view distinguishes a current listing from an overdue one, relative to whatever sync cadence the design fixes. | An automated test that, given the cadence the design fixes, seeds one listing whose last-synced marker is inside that window and one whose marker is older than it, and asserts the first renders as current and the second as overdue — the boundary value comes from the design, the test asserts the relative behavior. |
| C4 | The staff view presents `oncora-phase3`'s eligibility criteria — both inclusion and exclusion — exactly as the sync stored them, framed as the published criteria. | An automated test asserting the staff view reproduces every stored inclusion and exclusion `custom[]` string for `oncora-phase3` verbatim (including, e.g., the inclusion string "Measurable disease per RECIST 1.1") under a published-criteria framing, so staff can confirm what the sync published. |
| C5 | The surface is staff-only and changes no patient-facing view. | An automated test asserting the currency surface is reachable only with a staff token on the staff view, and a test of the patient-facing trial view asserting it renders no last-synced or currency field. |
| C6 | The surface composes only the synced listing and a sync timestamp, and introduces no new stored domain content. | An automated test asserting the currency response is built only from the existing trial / criteria rows plus the last-synced marker; `rg` over `products/` and `services/polaris-functions/` (excluding `data/synthetic/` and `*/test.*` fixtures) finds no hard-coded `oncora-phase3` inclusion or exclusion criterion string in non-test source. |

— Product Manager 🌱
