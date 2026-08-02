# Spec 300 — Prose-vs-structured-field drift detector for the vendored domain bundle

**Classification:** product-aligned. It protects two patient- and staff-facing
guarantees — that a trial's recruiting status shown to a patient is true, and
that public listings match the structured protocol data.

Serves issue #299. Serves issue #127.

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
Patient / Advocate job names as its Anxiety. The opposite-error variant sits one
key over in the same bundle, so this is a class, not one string.

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

> A generated `prose-cache.json` assertion must not contradict the `story.dsl`
> structured field it derives from. On contradiction, flag it and route the
> finding upstream to `fit-terrain`. Never edit the vendored bundle in-tree.

- **Charter field family — recruiting status (`status`).** Serves #299 in full.
  A FAQ or explainer whose recruiting language contradicts the trial's
  structured `status` is a contradiction the gate reports. A single trial can
  own more than one prose variant (each `prose-cache.json` key carries a `#hash`
  suffix — DIABPREV-201 has two diabetes-prevention FAQ variants, both in
  conflict with `active_not_recruiting`); every variant is checked independently.
- **Second field family — criteria-in-prose.** Serves the *automatable slice* of
  #127: any FAQ or explainer prose that restates an eligibility criterion and
  contradicts the structured criteria rows for that trial. The rule is the same
  code with a different field; this family lands as data, not a new detector.
  This family absorbs only the automatable slice of #127 — it does **not** close
  #127's headline residual (see Excluded).
- **Detect and route only.** The gate cannot repair a self-contradictory string
  — an in-tree guard has no authority over vendored content. On a finding it
  emits a durable, structured record naming the trial, the prose key, and the
  structured field in conflict, addressed to the upstream source of record.

### Explicitly excluded

| Excluded | Why |
| --- | --- |
| Editing or auto-correcting the prose in-tree | `PROVENANCE.md` + the SHA gate forbid mutating the vendored bundle; the corrected string can only come from an upstream vendor-and-render cycle. |
| #127's headline residual — the staff-flag workflow | `story.dsl` and its rendered listing agree with each other while both are stale versus the real-world protocol in force today. There is no second in-tree operand for "the protocol today," so no automatic detector sees it. That case needs a staff-initiated flag and stays open on #127. |
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
| SC1 | A generated prose assertion that contradicts the structured `status` it derives from is detected — the gate fails on the current bundle, naming the offending prose key(s). | Run the gate over the committed `data/synthetic/` bundle; it reports both DIABPREV-201 diabetes-prevention FAQ variants (keys `#654af833` and `#95cdcd2e`) as conflicting with `active_not_recruiting`. |
| SC2 | A bundle whose prose agrees with its structured fields passes clean — no false positive on the consistent trials. | Run the gate over CARDIO-301 (`cardio-outcomes`, `status "recruiting"`, FAQ says "currently enrolling"); the gate reports no finding for it. |
| SC3 | The gate never mutates the vendored bundle. | `sha256sum -c SOURCE.sha256` still passes after a gate run. |
| SC4 | On a contradiction the gate emits a durable, structured record naming the trial, the offending prose key (including its `#hash`), and the conflicting structured field, addressed upstream. | Inspect the record the gate emits for the DIABPREV-201 finding. |
| SC5 | Adding the criteria-in-prose field family reuses the same rule — a second family is expressed as data, not a second detector. | The design/implementation adds the criteria family without a parallel code path; reviewed at design. |
| SC6 | The gate runs in CI over the bundle, so a future vendored contradiction is caught before merge. | The gate joins the existing seed-check CI job that already exercises the bundle (`check-seed`, which runs `build-seed.sh`); a seeded contradiction fails the check. |

## Approval

Spec approval is human-only. This PR carries no `spec:approved` label and no
`spec approved` STATUS row. A `300<TAB>spec<TAB>draft` row is already seated in
`wiki/STATUS.md` under the claim.

— Product Manager 🌱
