# Spec 300 — Prose-vs-structured-field drift detector for the vendored domain bundle

**Classification:** product-aligned. It protects two patient- and staff-facing
guarantees — that a trial's recruiting status shown to a patient is true, and
that public listings match the structured protocol data.

Serves issue #299. Issue #127 is out of this spec's charter — see Explicitly
excluded.

## Problem

The whole domain is rendered from one vendored bundle: `story.dsl` holds the
structured truth (a trial's `status`, enrollment, criteria) and
`prose-cache.json` holds generated patient-facing prose (FAQs, explainers)
derived from it. Nothing in the app reconciles the two. Every surface passes the
generated prose through verbatim, so a contradiction baked into the bundle
reaches the patient unaltered.

One is live today. The DIABPREV-201 FAQ
(`clinical_trial_faq_diabetes-prevention`) tells a patient the trial "is
currently enrolling participants ... looking for about 300 people" and, in the
same answer, "we are not currently recruiting new participants at this time." It
also disagrees with the structured field it derives from: that trial's `status`
is `active_not_recruiting` at 298 of 300 enrolled — enrollment is essentially
complete, so "not currently recruiting" is the true half. A patient reads the
enrolling half, calls a coordinator, and lands the exact wasted click the
Patient / Advocate job names as its Anxiety. The same contradiction class recurs
elsewhere in the bundle, so this is a class, not one string.

The bundle is vendored verbatim and SHA-guarded (`build-seed.sh` fails on any
local edit; `PROVENANCE.md` forbids editing it). So the app cannot fix the
string — the durable correction terminates upstream in `fit-terrain`. What the
app can own is a gate that catches the contradiction before the bundle ships,
names it, and routes it upstream.

## Personas and jobs served

| Persona | Job | Why this matters |
| --- | --- | --- |
| Patient / Advocate | Find a Relevant Trial | An accurate recruiting status is the difference between an actionable trial and a wasted call — the job's central Anxiety. |
| Clinical Development Staff | Keep Listings True | Public listings must match the protocol's enrollment state; a self-contradicting FAQ is a stale listing by another name. |

## Scope

An in-tree DETECT+ROUTE consistency gate over the vendored `data/synthetic/`
bundle. Its rule, stated once and parameterized by field:

> A generated prose assertion that ships to a patient must not contradict the
> `story.dsl` structured field it derives from. On contradiction, flag it and
> route the finding upstream to `fit-terrain`. Never edit the vendored bundle
> in-tree.

**The operand is the shipped prose.** The gate checks the rendered value a
patient actually reads against that trial's structured field. Two prose surfaces
ship keyed by the trial, and both are in the operand: the `trial_faqs.faq` row
and the `consent_summaries.summary` row. Each is seeded by the verbatim hyphen
`story.dsl` trial id and read by `trial_id` — `show-trial.js` returns them as
`faq` and `consentSummary`, and `build-seed.sh` renders both as prose tables. The
gate never identifies or dedupes shipped prose by a `prose-cache.json` key, its
`#hash`, or a spelling heuristic: `#hash` is a prompt hash, so the same suffix
recurs across spellings with different text, and only the rendered hyphen row
ever ships. One shipped row per trial per surface is the whole operand set.

- **Charter field family — recruiting status (`status`).** Serves #299 in full.
  A trial FAQ or consent summary whose recruiting language contradicts the
  trial's structured `status` is a contradiction the gate reports. DIABPREV-201
  is the live instance on both surfaces: its shipped diabetes-prevention FAQ
  conflicts with `active_not_recruiting`, and its consent summary asserts "About
  300 people will join DIABPREV-201" while the trial sits at 298 of 300 enrolled.
- **One charter field family — `status`.** This spec ships exactly the recruiting-status
  family above. The rule table is parameterized by field so a later family (for
  example criteria-in-prose) is added as data, but no second family is in this
  spec's charter — see Explicitly excluded.
- **The operand is the trial-keyed surfaces; other prose is a declared future
  extension.** Six prose tables render, and they split by key. Two are keyed by
  trial — `trial_faqs` and `consent_summaries` — so each checks directly against
  one trial's structured fields, and both are in scope. The other four are keyed
  by something else: condition-explainers by condition
  (`clinical_condition_explainer_<condition>`), and `patient_stories`,
  `site_descriptions`, `therapy_descriptions` by their own entities. Checking any
  of them against a trial's fields needs a join this spec does not define and no
  success criterion exercises, so they land in a later spec once that join
  exists.
- **Detect and route only.** The gate cannot repair a self-contradictory string
  — an in-tree guard has no authority over vendored content. On a finding it
  emits a durable, structured record naming the trial, the shipped prose row
  (FAQ or consent summary), and the structured field in conflict, addressed to
  the upstream source of record. A trial's FAQ finding and consent finding route
  as two separate records.

### Explicitly excluded

| Excluded | Why |
| --- | --- |
| Editing or auto-correcting the prose in-tree | `PROVENANCE.md` + the SHA gate forbid mutating the vendored bundle; the corrected string can only come from an upstream vendor-and-render cycle. |
| #127's headline residual — the staff-flag workflow | `story.dsl` and its rendered listing agree with each other while both are stale versus the real-world protocol in force today. There is no second in-tree operand for "the protocol today," so no automatic detector sees it. That case needs a staff-initiated flag and stays open on #127. |
| Criteria-in-prose drift — the automatable slice of #127 (prose that restates an eligibility criterion versus the structured criteria rows) | The bundle carries a criteria *surface* (DIABPREV-201's consent "WHO CAN JOIN THIS STUDY" section) but no demonstrated criteria *contradiction*, so a detection success criterion cannot be written from it and none of SC1–SC6 exercises it. Charting it now would over-claim #127 coverage the SC set does not test. It is a declared future extension: the field-parameterized rule table takes a `criteria` family as data once a live contradiction operand exists. The whole of #127 stays open. |
| Non-trial-keyed prose — condition-explainers, `patient_stories`, `site_descriptions`, `therapy_descriptions` | Of the six rendered prose tables, these four are keyed by condition, story, site, or therapy — not by trial. Drift-checking any of them against a trial's structured fields needs a join this spec does not define. All four are declared future extensions, not part of the current charter; the two trial-keyed surfaces (`trial_faqs.faq`, `consent_summaries.summary`) are the whole operand. |
| Unreferenced `prose-cache.json` keys (spelling-alias duplicates, orphan FAQ slugs that render zero rows) | These never ship, so they are not part of the shipped-prose operand SC1–SC6 cover. A gate MAY additionally flag a newly-unreferenced key as cache hygiene, but that is a distinct concern, separate from shipped-prose drift. |
| Any change to the render path | Surfaces already pass prose through verbatim; this gate runs over the bundle, not the app. |

**Cost stated plainly.** Because correction terminates upstream, the latency
from a caught contradiction to a fixed bundle is one vendor-and-render cycle, not
instant. That is the accepted trade for never forking the source of record.

## Compatibility

Additive, clean break not applicable — the gate is a new check over existing
data and changes no shipped behavior. No path is removed.

## Success criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| SC1 | A shipped prose assertion that contradicts the structured `status` it derives from is detected — the gate fails on the current bundle, naming the offending trial and its shipped prose row. | Run the gate over the committed `data/synthetic/` bundle; it reports both of DIABPREV-201's shipped diabetes-prevention rows — the FAQ (`trial_faqs.faq`) and the consent summary (`consent_summaries.summary`) — as conflicting with `active_not_recruiting`. |
| SC2 | A bundle whose prose agrees with its structured fields passes clean — no false positive on the consistent trials. | Run the gate over CARDIO-301 (`cardio-outcomes`, `status "recruiting"`, FAQ says "currently enrolling"); the gate reports no finding for it. |
| SC3 | The gate never mutates the vendored bundle. | `sha256sum -c SOURCE.sha256` still passes after a gate run. |
| SC4 | On a contradiction the gate emits a durable, structured record naming the trial, its shipped prose row, and the conflicting structured field, addressed upstream. Each surface routes as its own record. | Inspect the records the gate emits for DIABPREV-201; the FAQ finding and the consent-summary finding are two distinct routable records. |
| SC5 | The consent-summary surface reuses the same rule as the FAQ surface — the second prose surface is expressed as data (one reader feeding the shared join and rule table), not a second detector. | The design/implementation adds the consent surface without a parallel code path; reviewed at design. |
| SC6 | The gate runs in CI over the bundle, so a future vendored contradiction is caught before merge. | The gate joins the existing seed-check CI job that already exercises the bundle (`check-seed`, which runs `build-seed.sh`); a seeded contradiction fails the check. |

## Approval

Spec approval is human-only. This PR carries no `spec:approved` label and no
`spec approved` STATUS row. A `300<TAB>spec<TAB>draft` row is already seated in
`wiki/STATUS.md` under the claim.

— Product Manager 🌱
