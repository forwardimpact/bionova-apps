# Spec 150: Self-check scores a trial's clinical criteria

**Classification:** Product — serves the Patient / Advocate persona's public
discovery job; changes patient-facing screening behavior, not internal tooling.

**Persona / job:** Patient / Advocate — *Find a Relevant Trial* (Big Hire), and
its Little Hire: *"gauge whether I might be eligible before I call a
coordinator."* ([JTBD.md](../../JTBD.md))

## Problem

Spec 10 gave the patient a plain-language pre-check, but it screens only the
demographic gate — age, ECOG, and required/excluded conditions. A trial's custom
clinical criteria, the facts that usually decide fit, never move the patient's
plain-language result. Two gaps, both on `main` today:

1. **On the CLI, the patient cannot answer the custom criteria at all.** The
   `eligibility` command accepts only age, conditions, and ECOG, and
   `checkEligibility` forwards only the answers it receives — so a CLI check
   reaches the scorer with `custom_answers: {}`. Every custom inclusion criterion
   is therefore unanswered, which caps the result at "possibly eligible" and lets
   no self-reported exclusion fire.
2. **The plain-language result never reflects an answered custom criterion.**
   `buildPreCheck` routes every custom criterion — inclusion and exclusion — into
   the "confirm with the coordinator" section verbatim, and drops the scorer's
   per-criterion outcome for each one. So even where the answers already reach the
   scorer — the web form collects and forwards them, and the score already
   reflects them — the shared plain-language view (rendered on the CLI today; the
   web result page still shows only the match-score badge, per X4) still shows
   every clinical criterion as an open coordinator question. The patient is never
   told which clinical criteria they met, which they did not, and which they left
   unanswered. The scorer reports an outcome for an exclusion criterion only when
   the patient answers it affirmatively; an exclusion left unanswered produces no
   signal at all. So the self-check must itself distinguish an answered exclusion
   from an unanswered one — a blank exclusion must never be read as "not
   excluded."

Evidence, on `main` today:

| Where | What happens | Why it fails the job |
| --- | --- | --- |
| The `eligibility` CLI command | Defines only age, conditions, and ECOG inputs. | A CLI user has no channel to self-report the clinical facts that decide fit. |
| `checkEligibility` from the CLI | Forwards only the answers it receives, so the CLI request reaches the scorer with `custom_answers: {}`. | Every custom inclusion criterion arrives unanswered; the result is capped at "possibly eligible" and no exclusion can fire. |
| The scorer | Already scores custom answers: an inclusion custom answered true counts toward `eligible`, an unanswered one forces `possibly_eligible`, an exclusion custom answered true yields `not_eligible`. | The engine is ready; the patient-facing layer does not use it for the clinical criteria. |
| `buildPreCheck` (the plain-language view every surface shares) | Places all custom criteria verbatim under "confirm with the coordinator" and discards the scorer's met / not-met / unanswered outcome for each. | Even when a criterion is answered and scored, the patient's plain-language result never says they met or missed it. |
| The seeded trial `diabetes-prevention` | Gates on inclusion custom (HbA1c range, BMI range, stable metformin) and exclusion custom (low eGFR, diabetic-ketoacidosis history, recent insulin) — all facts a patient can self-report. | The plain-language self-check shows all six as coordinator questions no matter what the patient knows. |

The net effect on the job: the patient's plain-language self-check can never say
"you likely meet this trial's clinical requirements" or "you likely do not," for
exactly the criteria that decide fit. The Little Hire is half-delivered — the
patient still has to call to learn anything real about the clinical gate.

Spec 10 made this a deliberate choice (S2: custom criteria are shown verbatim as
coordinator questions, "never disguised as an answerable prompt") to avoid
hand-authored rewrites and to avoid asking patients to interpret protocol text.
This spec revisits that boundary: custom criteria become **optionally
self-reportable**, still shown as their verbatim text, with an unanswered
criterion always defaulting to coordinator-confirmation.

## Scope

Grounded in the `criteria` entity's inclusion/exclusion `custom[]` strings
(rendered from [`data/synthetic/story.dsl`](../../data/synthetic/story.dsl)), the
`eligibility-check` edge function scorer (which already scores `custom_answers`),
the surface-agnostic handler view model (`buildPreCheck` in
`products/polaris/handlers/`), and the `eligibility` CLI command. The work is
infra-independent — pure handler and CLI logic. Every surface that renders the
shared view model inherits the richer result.

In scope:

| # | The self-check will… |
| --- | --- |
| S1 | Give the `eligibility` CLI command a way to answer a trial's custom inclusion and exclusion criteria — the input path the web form already has and the CLI lacks — alongside the existing age, ECOG, and condition inputs. The CLI identifies each custom criterion by a stable index (its position in the trial's inclusion/exclusion `custom[]` list), not by echoing the criterion's protocol text — that text is untrusted to the parser and may contain commas, equals signs, and other delimiters. |
| S2 | Surface each custom criterion the patient answers — inclusion or exclusion — as supporting or working against fit, matching the scorer's outcome. Because the scorer signals an exclusion only when answered affirmatively, the self-check distinguishes an answered exclusion from an unanswered one, so a negative answer can count toward fit while a blank never does. Each criterion is shown as its verbatim `custom[]` text. |
| S3 | Treat any custom criterion the patient does not answer — inclusion or exclusion — as still-to-confirm, routed to the coordinator, never guessed for or against, so leaving a question blank is always safe and never fabricates a pass or a fail. |
| S4 | Keep spec 10's non-judgmental three-way framing (likely fits / likely does not fit / could not check) and its self-assessment-not-a-decision disclaimer and contact-the-coordinator next step on every outcome — including "likely fits," since a patient can misjudge a clinical threshold and the disclaimer is what tempers that false hope. |
| S5 | Preserve the privacy posture: record only the existing anonymous interest signal (trial id, screener answers, score) — no PII — with the custom answers carried inside the same anonymous screener-answers field. |
| S6 | Count a custom answer as affirmative only on an explicit affirmative value; every other value — including a blank or an unrecognized string — is non-affirmative. An exclusion answered affirmatively fires even when a surface supplies the answer as text. |

**Invariant:** Answered custom criteria are rendered as escaped text, exactly
like every other `story.dsl`-derived string; this spec introduces no raw or
unescaped rendering path for criterion text.

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | Changing the scorer's clinical algorithm or the meaning of any criterion. | Spec 10 X1 — the engine already scores custom answers; this spec supplies inputs and surfaces outcomes it already produces. |
| X2 | Hand-authoring plain-language rewrites of the `custom[]` protocol strings. | No-hand-authored-domain-content invariant (CLAUDE.md); the criterion text is shown verbatim, and misstating a clinical criterion would be worse than punting it. |
| X3 | Any binding, diagnostic, or medical determination. | It remains a self-assessment; the coordinator is the decision point. |
| X4 | Bringing the web result page onto the plain-language view. | The web form already collects and forwards custom answers, but the web result page shows the raw match-score badge, not the plain-language explanation; moving it onto the shared view is the spec 10 X6 follow-on. |
| X5 | The Clinical Development Staff and Referring Physician jobs. | This spec serves the Patient / Advocate job only. |
| X6 | A structured `checks[]` trace from the edge function (issue #60). | Related internal plumbing, not required here; this spec works with the scorer's current response. |
| X7 | Widening the criteria projection to any staff-only field — the currency marker or staff `custom[]` annotations. | The self-check reads only the patient-facing inclusion/exclusion `custom[]` strings; this preserves the spec 70 staff-view layering. |

## Success criteria

Each is a claim plus the command or path that verifies it. Handler and template
tests under `products/polaris/handlers/test/` are the primary verifiers; the
`eligibility` CLI command exercises the rendered output end to end. Tests key on
the stable trial id `diabetes-prevention` and the criterion fields only — never
on a re-vendorable exact string such as `DIABPREV-201`.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | The `eligibility` command lets the patient answer a trial's custom inclusion and exclusion criteria by stable index — its position in the trial's inclusion/exclusion `custom[]` list, not the criterion's protocol text — and those answers reach the scorer; today the command defines only age, conditions, and ecog. | A CLI/handler test supplying custom answers by index through the command and asserting they arrive in the `eligibility-check` request, which carries no custom answers today. |
| C2 | With custom answers supplied, the plain-language result names each answered custom criterion under "where you likely fit" or "where you likely do not fit" — matching the scorer's outcome for it — rather than under coordinator questions. | Handler/template tests over a `diabetes-prevention`-shaped fixture asserting an answered inclusion custom appears in the supports section and a self-reported exclusion in the against section, not in coordinator questions. |
| C3 | A self-reported custom exclusion produces the "likely does not fit" outcome, and a set that satisfies every structured and custom inclusion criterion produces "likely fits". A "likely fits" result still lists every unconfirmed (unanswered) exclusion under coordinator questions rather than hiding it. | Handler tests asserting each outcome for its answer set; the "likely fits" answer set must jointly satisfy the fixture's age, ECOG, and condition gates as well as every custom inclusion; the `diabetes-prevention` fixture is chosen so such a set exists. |
| C4 | A custom criterion the patient leaves unanswered — inclusion or exclusion — renders under confirm-with-the-coordinator and does not move the outcome. In particular an unanswered exclusion is never read as cleared/"not excluded." | A handler/template test supplying answers for some but not all custom criteria and asserting the unanswered ones stay in coordinator questions. |
| C5 | Each custom criterion is shown as its verbatim `custom[]` string, and no hand-authored criterion prose is introduced outside `data/synthetic/`. | A handler test asserting the rendered custom criteria equal the fixture's `custom[]` strings verbatim, plus `rg` over `products/` finding no trial-specific eligibility-criterion strings committed outside `data/synthetic/`. |
| C6 | The pre-check adds no new recorded field: the anonymous interest signal still carries exactly `trial_id`, `screener_answers`, and `match_score` (no PII), with the custom answers inside `screener_answers`. | A handler test asserting the `interest_signals` insert body has exactly those keys. |
| C7 | A self-reported exclusion marked affirmatively fires regardless of whether the surface passes a boolean or a string; a non-affirmative or blank value never fires it. | A handler test asserting both — an affirmative boolean and an affirmative string each fire the exclusion, while a non-affirmative and a blank value each leave it unfired. |

— Product Manager 🌱
