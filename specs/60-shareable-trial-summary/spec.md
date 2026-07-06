# Spec 60: Shareable plain-language trial summary

**Classification:** Product — serves the Referring Physician persona's
in-visit referral job; changes patient-facing behavior (what a physician can
hand a patient), not internal tooling.

**Persona / job:** Referring Physician — *Refer in the Visit* (Big Hire): *"Help
me search trials on behalf of patients and share the details,"* and its Little
Hire: *"Help me bookmark a trial and hand the patient something they
understand."* ([JTBD.md](../../JTBD.md))

## Problem

A referring physician has three minutes left in an appointment and wants to hand
the patient a plain-language summary of a trial they can trust and take away.
Polaris renders every trial from `data/synthetic/story.dsl`, including
patient-readable prose (the consent summary and FAQ), but offers no view that
selects that content into a compact, shareable summary. The only single-trial
view is the full detail (`show-trial`), which is a researcher/staff-grade dump.

Evidence, in the shipped surface today:

| Where | What the physician gets | Why it fails the job |
| --- | --- | --- |
| Trial detail (`show-trial`, the `trial` command) | Under the trial name, prominently lists `protocol_id`, `therapeutic_area`, `sponsor`, and `current_enrollment / target_enrollment` — e.g. `Protocol: BNV-ONC-2024-301`, `Enrollment: 287 / 450`. | These are sponsor/operations fields the patient does not need and cannot act on. They crowd out what the patient came for and read as researcher language, not a plain-language handoff. |
| Eligibility section of `show-trial` | The `criteria.inclusion`/`exclusion` `custom[]` strings verbatim — e.g. "Histologically confirmed NSCLC stage IIIB/IV", "Measurable disease per RECIST 1.1" — plus `Age: 18–75` and `ECOG max: 2`. | This is protocol language written for researchers. A patient handed this cannot judge whether the trial fits them, which feeds the job's Anxiety: *recommending a trial that turns out to be a poor fit.* |
| Any surface | There is no view that emits a patient-facing summary. `show-trial` is the whole artifact or nothing; the physician cannot produce a clean, trustworthy takeaway inside the visit. | The Pull the job names — *a shareable, plain-language summary I can trust in front of a patient* — has no surface at all. |

The patient-readable content already exists in the rendered world (trial name,
what it studies, where it enrolls, the consent summary, the FAQ). What is missing
is a view that selects that content and presents it as a self-contained summary
the physician can share. This spec defines that view.

## Scope

Grounded in the trial content Polaris already renders from
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) — the `trial` row,
its linked `sites`, `conditions`, `principal_investigator`, the consent-summary
prose, and the FAQ prose, all of which the existing full-detail view already
composes. This spec defines a new patient-facing view
of a single trial: additive to, and distinct from, the full-detail view, and
available on every surface where a trial can be shown. Whether the plain-language
eligibility content is derived here or shared with another surface, and how the
view is delivered, are design decisions.

The view presents eligibility in plain language — the age range and required
condition in readable terms — and never the raw inclusion/exclusion `custom[]`
protocol strings. This plain-language eligibility band is defined by this spec
and stands on its own. [Spec 10](../10-eligibility-precheck/spec.md) establishes
a patient-facing eligibility layer for the Patient/Advocate job; where that layer
is live on a surface, this view should align with its wording rather than derive
a second one. Spec 10 is a **related, not blocking** dependency: this view ships
whether or not Spec 10 has reached a given surface.

In scope:

| # | The shareable summary will… |
| --- | --- |
| S1 | Present a **patient-facing subset** of the trial: its name, what it studies in plain terms (from the condition and consent-summary prose), whether it is open to new patients (framed from the trial status — a recruiting trial reads as open, any other status as not currently open — never from the raw enrollment counts), and where it enrolls (site cities). |
| S2 | Present eligibility as a **plain-language band** — the age range and required condition in readable terms — and never reproduce the `protocol_id`, `sponsor`, `therapeutic_area`, raw enrollment counts, the ECOG performance ceiling, or the inclusion/exclusion `custom[]` protocol strings that `show-trial` shows. |
| S3 | Include the trial's **consent summary and the FAQ** — the prose already written for patients — as the trustworthy body of the handoff. |
| S4 | Be a **self-contained artifact**: readable on its own without the physician narrating it, and carrying a clear "talk to the trial coordinator / your physician" next step so the patient knows what to do with it. |
| S5 | Carry a **not-a-recommendation framing** so the physician can share it without implying a fit determination — directly tempering the job's Anxiety about recommending a poor-fit trial. |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | Delivery — email, SMS, print formatting, QR codes, or any channel that sends the summary somewhere. | This spec produces the shareable artifact; how it travels is a follow-on. The rendered text is itself shareable (copy, hand over, read aloud). |
| X2 | Bookmarking or saving trials for later. | Persistence needs accounts and stored state Polaris does not have. The "hand the patient something" half of the Little Hire is served here; the "bookmark" half is a separate spec once a persistence surface exists. |
| X3 | Hand-authoring any plain-language prose. | Violates the no-hand-authored-domain-content invariant (CLAUDE.md). The summary composes prose that already exists in `data/synthetic/`. |
| X4 | Changing `show-trial` or removing any field it shows. | The staff/detail view stays; this adds a parallel patient-facing view. |
| X5 | Any eligibility determination or clinical judgment about a specific patient. | The summary is informational; where it is offered, fit is assessed by the Patient/Advocate eligibility pre-check (Spec 10) and always confirmed by the coordinator. |
| X6 | The Patient / Advocate and Clinical Development Staff jobs. | This spec serves the Referring Physician job only. |

## Success criteria

Each is a claim plus the command or path that verifies it. Automated tests under
`products/polaris/handlers/test/` are the primary verifiers, exercising the
rendered summary against the seeded trial `oncora-phase3` (ONCORA-301), for which
consent-summary and FAQ prose are seeded. Which layer hosts each assertion is a
design decision.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | For `oncora-phase3`, the summary renders the trial name, a plain-language description of what it studies, an open-to-new-patients framing derived from the recruiting status, and its site cities — and does **not** render the protocol id, the sponsor, a therapeutic-area line, or the raw enrollment counts. | A test under `products/polaris/handlers/test/` asserting the rendered summary contains the trial name, its site cities, and an open/recruiting-status phrase; contains none of the strings `BNV-ONC-2024-301`, `BioNova Therapeutics`, or `287 / 450`; and carries no rendered therapeutic-area field line. |
| C2 | The summary presents eligibility as a plain-language band (age range and required condition in readable terms) and never reproduces the inclusion/exclusion `custom[]` protocol strings (e.g. "Measurable disease per RECIST 1.1") or the `ECOG max` line. | A test under `products/polaris/handlers/test/` asserting the rendered summary reproduces no `custom[]` string from the trial's `criteria` and contains no `ECOG` line. |
| C3 | The summary includes the trial's consent-summary prose and its FAQ prose as rendered from `data/synthetic/`. | A test under `products/polaris/handlers/test/` asserting the rendered summary contains the trial's consent-summary text and its FAQ text. |
| C4 | The summary renders a next-step line directing the patient to the coordinator or their physician, and a statement that it is informational and not a fit determination. | A test under `products/polaris/handlers/test/` asserting both the next-step line and the not-a-recommendation statement are present. |
| C5 | The summary composes only content already present in `data/synthetic/` and introduces no new stored domain content or trial-specific prose of its own. | A test under `products/polaris/handlers/test/` asserting the summary response is built only from the existing trial / consent / faq / criteria / condition / site fields and adds no new stored field; `rg` over `products/` (excluding `data/synthetic/` and test fixtures) finds none of `oncora-phase3`'s consent-summary, FAQ, or `custom[]` strings hard-coded in source. |

— Product Manager 🌱
