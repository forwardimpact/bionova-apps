# Spec 280: Screener result carries the trial's recruiting status

**Classification:** Product — serves the Patient / Advocate persona's public
discovery job; changes patient-facing screener behavior, not internal tooling.

**Persona / job:** Patient / Advocate — *Find a Relevant Trial* (Big Hire), and
its Little Hire: *"Help me gauge whether I might be eligible before I call a
coordinator."* ([JTBD.md](../../JTBD.md)). The progress the patient seeks is
deciding whether calling a coordinator is worth it. A "possibly eligible" result
on a trial that is not recruiting sends the patient to call about a trial that
cannot enrol them — undercutting that Little Hire. This false hope is a
different kind from not-qualifying: the patient may fully qualify and still be
unable to enrol. The defect was reported (#298) while exercising the **Referring
Physician: Refer in the Visit** scenario, where the same screener is driven on a
patient's behalf and the same false hope becomes a poor referral; this spec
serves the Patient / Advocate job.

## Problem

The eligibility screener reports a fit outcome from the criteria answers alone,
and never says whether the trial is actually accepting new participants. Per
#298, the root cause is that the trial's recruiting `status` never enters the
screener: the `eligibility-check` scorer (spec 10) computes `match_score` from a
trial's inclusion/exclusion criteria with no reference to `status`, and the
plain-language pre-check layered over it (surfaced through `check-eligibility`)
likewise never reads `status`. So a trial that is not recruiting scores and
renders the same fit outcome as one that is.

Whether a patient *qualifies* and whether a trial is *open to enrol them* are
two different questions. The screener answers the first and stays silent on the
second, so "possibly eligible" reads as an invitation to act on a trial that may
be closed.

Evidence, against the seeded world (`data/synthetic/story.dsl`):

| Trial (id) | `status` | What the screener reports | Why it fails the job |
| --- | --- | --- | --- |
| `diabetes-prevention` (name DIABPREV-201) | `active_not_recruiting` | "Possibly eligible", no recruiting context (#298, observed). | The patient reads "you may fit" and calls a coordinator about a trial not accepting participants today. |
| `oncora-phase1` | `completed` | "Possibly eligible", no recruiting context (inferred — same code path). | The trial has finished enrolling; the fit result invites a call that leads nowhere. |
| `copd-inhaler` | `not_yet_recruiting` | "Possibly eligible", no recruiting context (inferred — same code path). | The trial is not open to participants yet; "you may fit" overstates what the patient can do now. |

The `trial` entity carries a `status` field, rendered from `story.dsl`. Across
the seed's six trials it takes four values: `recruiting` (`oncora-phase3`,
`cardio-outcomes`, `her2-combo`), `active_not_recruiting` (`diabetes-prevention`),
`completed` (`oncora-phase1`), and `not_yet_recruiting` (`copd-inhaler`). This
status is trusted domain data the product uses elsewhere — the shareable-summary
spec (spec 60) specifies framing it as "open to new patients", and trial search
already filters on it — but the screener result ignores it.

## Scope

Grounded in the `trial` entity's `status` field, rendered from
[`data/synthetic/story.dsl`](../../data/synthetic/story.dsl) — one value per
trial. Neither surface has the trial's `status` in hand for the result today:
the CLI/handler path (`check-eligibility`) fetches the trial's criteria and
condition names but never the `trial` row, so it never reads `status`; and the
web screener result page fetches the trial (whose data includes `status`, via
`showTrial`) but does not use `status` when rendering the result. Closing #298
means the screener must obtain the trial's recruiting `status` and surface it
with the fit outcome — net-new data on the CLI/handler surface.

In scope:

| # | The screener will… |
| --- | --- |
| S1 | Surface a non-recruiting trial's recruiting `status` with its screener result, so the fit outcome for a non-recruiting trial is never shown without stating the trial is not open to enrol. |
| S2 | Surface **which** non-recruiting state applies, as distinct plain-language text that names the state — not a single "not recruiting" flag. The intended meaning per value: `active_not_recruiting` → not accepting new participants right now; `completed` → has finished enrolling; `not_yet_recruiting` → not yet open to participants. |
| S3 | Render a trial whose `status` is exactly `recruiting` as it renders today, adding no status text — a recruiting trial's open state is the existing, unchanged render. This no-status-text branch is scoped to `recruiting` alone; every other value routes through S1/S2 or S6, never to silence. |
| S4 | Keep spec 10's non-judgmental, self-assessment-not-a-decision voice; the recruiting status is framing context, not a new medical determination. |
| S5 | Carry this on **both** surfaces that render a result — the CLI/handler result and the web screener result — see the surface boundary below. |
| S6 | Fail safe on an unknown or absent `status`: any value that is neither `recruiting` nor one of the three enumerated non-recruiting states (S2) — a future value such as `suspended`/`terminated`, or a missing status — resolves to a single generic not-confirmed-open framing (the trial's open state is not confirmed today), never to the no-status-text render. This routes the unenumerated case to one fail-safe message; it adds no new per-value prose, so the closed enumeration is not extended (X5). |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | Changing the `eligibility-check` match algorithm or any criterion's clinical meaning. | This spec **annotates and frames** the result with recruiting status; it does not rescore. The `match_score` and its `reasons` for a given answer set are unchanged (spec 10 X1). |
| X2 | Suppressing, downgrading, or hiding the fit outcome for a non-recruiting trial. | Hiding the outcome would be a de-facto rescore (X1) and would discard information the patient can still use (e.g. to look for similar open trials). The fit result stays; the recruiting context rides alongside it, unmissable. |
| X3 | Scoring or surfacing the depth of a trial's clinical `custom[]` criteria — the qualifying-fit-depth axis (issue #130; its proposed spec 150 is PR #171). | That is criteria-screening depth — whether the patient *qualifies* — a separate axis from whether the trial is *open*. This spec touches neither the custom-criteria input path nor their per-criterion rendering. |
| X4 | The screener's default-answer behavior (open issue #300); the post-submit redirect origin (#301, closed). | #300 is a separate in-flight mechanical fix this spec does not change; #301 is already resolved and its redirect path is not touched here (the web status text is independent of the submitted score — see the surface boundary). |
| X5 | Hand-authoring per-trial status prose. | Violates the no-hand-authored-domain-content invariant (CLAUDE.md). The status **value** is domain data from `story.dsl`; the plain-language phrasing is presentation, the same shape spec 60's status framing and the existing match-score labels already use. |
| X6 | Changing what the screener records. | Preserve spec 10's privacy posture: the anonymous, no-PII interest signal (trial id, screener answers, score) is unchanged. |

### Surface boundary (S5)

Both result surfaces are in scope, because the gap exists on both and #298 pins
the root cause to the shared scoring/pre-check path:

- **CLI / handler result:** the recruiting status is surfaced with the
  plain-language result, so every handler-driven surface carries it. This is
  net-new data the handler must obtain (it does not read `status` today).
- **Web screener result:** the recruiting-status text accompanies the result the
  web page renders after submit, drawn from the trial the page fetches (its data
  includes `status`, via `showTrial`, though the page does not use `status` in
  the result render today) — not from the submitted answers or score. Spec 10 X6
  left the web screener's fit-result presentation on the raw layer, and this spec
  **preserves** that: the score badge keeps rendering as today, and only the
  recruiting-status context is added beside it. Moving the fit result itself onto
  the plain-language layer remains the follow-on spec 10 X6 names.

Spec 60 frames status as binary (recruiting = open, any other = not open) on the
shareable-summary surface; this spec distinguishes the three non-recruiting
states on the screener surface only, and changes nothing on the summary surface.

## Compatibility stance

Additive. The recruiting-status context is new information beside the existing
result; nothing is removed. The `match_score` enum, the `reasons`, and the
recorded interest signal are unchanged. No old path to remove.

## Success criteria

Each is a claim plus the command or path that verifies it. Handler and template
tests under `products/polaris/handlers/test/` verify the handler surface; the
`eligibility` CLI command exercises the rendered output end to end; a site-tier
test under `products/polaris/site/src/__tests__/` verifies the web surface.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | For `diabetes-prevention` (`active_not_recruiting`), the screener result renders text stating the trial is not accepting new participants right now, alongside — not replacing — the fit outcome. | A `products/polaris/handlers/test/` case asserting the rendered result contains both the fit outcome and text naming the not-accepting-participants state; `just cli eligibility diabetes-prevention` renders it end to end. |
| C2 | Each non-recruiting state renders text that names its specific state — `active_not_recruiting` (`diabetes-prevention`) as not accepting new participants, `completed` (`oncora-phase1`) as finished enrolling, `not_yet_recruiting` (`copd-inhaler`) as not yet open. | Handler/template test across the three trials, asserting each rendered result contains its own state-naming phrase and that the three phrases differ. |
| C3 | A `recruiting` trial (`oncora-phase3`) renders its result as it does today, with no status text added. | Handler/template test on `oncora-phase3` asserting none of the non-recruiting phrases appear. |
| C4 | The recruiting status frames only: for a fixed answer set the `match_score` and `reasons` are unchanged from before this spec, and the `eligibility-check` scorer is not modified. | Handler test asserting score/reasons for a fixed answer set are unchanged; `git diff` shows no change under `services/polaris-functions/eligibility-check/`. |
| C5 | The rendered result surfaces none of the raw underscored status identifiers — `active_not_recruiting`, `not_yet_recruiting`, `completed` — consistent with spec 10's no-raw-enum rule. | Template test asserting none of those identifier strings appears in the rendered result. |
| C6 | The web screener's result view (shown after submit, when a score is present) renders equivalent recruiting-status text for a non-recruiting trial beside the fit-result badge, and the badge itself is unchanged (spec 10 X6 preserved). | A site-tier test under `products/polaris/site/src/__tests__/` asserting the post-submit web result view renders the recruiting-status text for a non-recruiting trial with the fit-result badge unchanged. |
| C7 | The status text is determined solely by the `status` value — no per-trial status prose (X5). | A test that renders the status line from a `status` value alone, with no trial id or name as input, asserting the expected text for each of the three non-recruiting values; `rg` over `products/` finds none of the seed trial ids or names in the status-text source. |
| C8 | An unenumerated or absent `status` resolves to the generic not-confirmed-open framing (S6) and never to the recruiting no-status-text render. The seed carries no unenumerated value, so this is verified on a fabricated one. | A `products/polaris/handlers/test/` resolver unit test passing a fabricated `status` (e.g. `suspended`) and `null`, asserting the rendered result contains the generic not-confirmed-open text and none of the three named-state phrases, and that the `recruiting` no-status-text branch does not fire. |

— Staff Engineer 🛠️
