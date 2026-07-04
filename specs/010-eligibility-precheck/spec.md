# Spec 050: Plain-language eligibility pre-check

**Classification:** Product — serves the Patient / Advocate persona's public
discovery job; changes patient-facing behavior, not internal tooling.

**Persona / job:** Patient / Advocate — *Find a Relevant Trial* (Big Hire), and
its Little Hire: *"Help me gauge whether I might be eligible before I call a
coordinator."* ([JTBD.md](../../JTBD.md))

## Problem

A patient who finds a trial in Polaris cannot tell whether they might qualify
without reading researcher-grade protocol text. The scoring engine to answer
"do I fit?" already exists, but every point where the patient touches it speaks
protocol language, so the patient cannot use it to self-assess.

Evidence, in the shipped surface today:

| Where | What the patient sees | Why it fails the job |
| --- | --- | --- |
| Trial detail (`show-trial.md`) | The `criteria.inclusion`/`exclusion` `custom[]` strings verbatim — e.g. "Histologically confirmed NSCLC stage IIIB/IV", "Measurable disease per RECIST 1.1" — plus `Age: 18–75` and `ECOG max: 2`. | This is the "pages of protocol language written for researchers" the job's Trigger names. A patient cannot judge fit from it. |
| Screener input (`eligibility-check` contract) | `custom_answers` is keyed by the exact protocol string, so self-assessing a criterion like "Adequate organ function" means answering that protocol text true/false. | A patient cannot honestly answer a question they cannot read. The self-assessment is gated on comprehension the patient does not have. |
| Result (`check-eligibility.md`) | A bare enum — `match_score: possibly_eligible` — and machine-phrased `reasons` like "Age 55 within [18, 75]", "Meets: Measurable disease per RECIST 1.1". | The result neither reads as plain language nor tells the patient what to do next, and does nothing to temper the job's central Anxiety: *"getting my hopes up about a trial I will not qualify for."* |

The engine is sound; the patient-facing layer is missing. This spec defines that
layer: a plain-language pre-check that lets a patient self-assess likely fit
against a trial's own eligibility rules, honestly, before contacting a
coordinator.

## Scope

Grounded in the `criteria` entity rendered from
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) — one row per
trial, with `inclusion` (`age_min`, `age_max`, `ecog_max`, `conditions_required`,
`custom[]`) and `exclusion` (`conditions_excluded`, `active_autoimmune`,
`prior_immunotherapy`, `custom[]`). The pre-check operates on those `criteria`
rows and on the fit score from the existing `eligibility-check` edge function
(`services/polaris-functions/eligibility-check/`), at the surface-agnostic
handler layer (`products/polaris/handlers/`). It surfaces through the
`eligibility` CLI command (`check-eligibility` is a handler response/template
name, not a command), so every surface inherits the behavior. Note the condition
tokens in `conditions_required`/`conditions_excluded` (e.g. `lung_cancer`,
`active_autoimmune_disease`) are opaque slugs that do not all map to a
`condition` entity; rendering them readably is a problem for the design, and any
slug it cannot resolve to a readable name falls to the coordinator-questions
treatment (S2) rather than a fabricated label.

In scope:

| # | The pre-check will… |
| --- | --- |
| S1 | Present each **structured** eligibility rule — age band, ECOG ceiling, and required/excluded conditions — as a plain-language self-assessment prompt derived from the rule's data. |
| S2 | Present each **free-text protocol** rule (the inclusion/exclusion `custom[]` strings) transparently, in a distinct section of criteria to confirm with the coordinator — never disguised as an answerable plain-language self-assessment prompt. |
| S3 | Return a **plain-language likely-fit result** that explains, in patient-readable terms, where the patient likely fits, likely does not, and could not self-assess — instead of the raw `eligible`/`possibly_eligible`/`not_eligible` enum. |
| S4 | Frame every result as a self-assessment, not a decision, with a clear next step (contact the coordinator) — directly serving the Little Hire's "before I call a coordinator" and tempering the false-hope Anxiety. |
| S5 | Preserve the existing privacy posture: record only the current anonymous, no-PII interest signal. |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | Changing the clinical meaning of any criterion or the match algorithm in `eligibility-check`. | The engine is correct; this spec adds a plain-language layer over it. |
| X2 | Hand-authoring plain-language rewrites of the protocol `custom[]` strings. | Violates the no-hand-authored-domain-content invariant (CLAUDE.md) and risks misstating clinical criteria. |
| X3 | Any binding, diagnostic, or medical determination. | It is a self-assessment; the coordinator remains the decision point. |
| X4 | Coordinator contact, scheduling, or messaging. | Downstream of gauging fit. |
| X5 | The Clinical Development Staff and Referring Physician jobs. | This spec serves the Patient / Advocate job only. |
| X6 | Re-rendering the existing Next.js web screener (`products/polaris/site/src/app/trials/[id]/eligibility/`), which stays on the raw layer for now. | Handler-layer logic serves all surfaces; moving the web presentation onto the plain-language layer is a follow-on spec. |

## Success criteria

Each is a claim plus the command or path that verifies it. Handler and template
tests under `products/polaris/handlers/test/` are the primary verifiers; the
`eligibility` CLI command exercises the rendered output end to end.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | For the seeded trial `oncora-phase3`, the pre-check renders the age and ECOG rules as plain-language questions a patient can answer, not as the raw `Age: 18–75` / `ECOG max: 2` label-value lines the trial detail shows today. | A `products/polaris/handlers/test/` case asserting the rendered age and ECOG prompts read as plain-language questions and do not reproduce the raw `Age:` / `ECOG max:` label-value lines; `just cli eligibility oncora-phase3` renders that output end to end. |
| C2 | Free-text protocol `custom[]` strings appear only under the labeled coordinator-questions section, never as answerable self-assessment prompts. | Handler/template test asserting each `custom[]` string renders only within the coordinator-questions section. |
| C3 | The result reads in plain language, does not surface the raw `eligible`/`possibly_eligible`/`not_eligible` enum token, and explains in patient terms which rules support likely fit, which work against it, and which the patient could not answer. | Template test asserting the rendered result contains no raw enum token and states, per rule, how it bears on fit (including the could-not-answer case). |
| C4 | Every one of the three outcomes renders a "this is a self-assessment, not a decision" statement and a contact-the-coordinator next step. | Template test covering all three outcomes for the disclaimer + next-step line. |
| C5 | The pre-check adds no new recorded field and no hand-authored criterion text: it still records only the existing anonymous signal (trial id, screener answers, score — no PII), and introduces no criterion prose outside `data/synthetic/`. | Handler test asserting the `interest_signals` insert body (the `db.post` payload, not the handler return) has exactly the keys `trial_id`, `screener_answers`, `match_score`; `rg` over `products/` finds no trial-specific eligibility-criterion strings committed outside `data/synthetic/`. |

— Staff Engineer 🛠️
