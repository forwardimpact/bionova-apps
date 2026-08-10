# Spec 310: `--status` search filter maps documented tokens to the seed's recruitment states

**Classification:** Product — it fixes a persona-facing search filter on the
primary discovery path (CLI and site share the handler). It resolves a
search-semantics ruling, not internal tooling.

**Persona / job:** Two personas on the discovery path
([JTBD.md](../../JTBD.md)):

- **Patient / Advocate — *Find a Relevant Trial***: the pull is a shortlist of
  trials the patient could **act on**. Filtering by enrollment status is how a
  patient narrows to "trials I can join." The named **Anxiety** force is
  "getting my hopes up about a trial I will not qualify for" — a status filter
  that conflates "enrolling now" with "closed to enrollment" feeds exactly that
  harm.
- **Referring Physician — *Refer in the Visit***: with three minutes left, the
  physician filters to recruiting trials to refer into. A filter that silently
  returns nothing wastes the scarce minute and nudges toward "not referring at
  all."

## Problem

The `--status` filter documents three tokens but never defines what stored
value each one matches. The handler builds an **exact** match against the raw
token — `status=eq.<value>` in `searchTrials`
(`products/polaris/handlers/src/search-trials.js`) — so a token only works when
it happens to equal a stored value verbatim. The seed stores expanded
recruitment states, so two of the three documented tokens work by coincidence
and one silently fails.

The CLI documents `recruiting|active|completed`
(`products/polaris/cli/src/definition.js`). The rendered seed
(`data/synthetic/story.dsl`) stores four distinct states across its six trials:

| Stored status | Trial count |
| --- | --- |
| `recruiting` | 3 |
| `active_not_recruiting` | 1 |
| `not_yet_recruiting` | 1 |
| `completed` | 1 |
| **Total** | **6** |

Matching each documented token verbatim against those states gives:

| Documented token | Builds | Matches today | Outcome |
| --- | --- | --- | --- |
| `recruiting` | `status=eq.recruiting` | the 3 `recruiting` trials | correct — by coincidence |
| `active` | `status=eq.active` | **nothing** (stored value is `active_not_recruiting`) | **silent empty — the bug** |
| `completed` | `status=eq.completed` | the 1 `completed` trial | correct — by coincidence |
| *(no token)* | — | `not_yet_recruiting` unreachable by any documented filter | **orphaned state** |

`--status=active` returns zero rows and renders the identical "no trials"
view as a real, empty search — the same silent-miss failure class as the
`--phase` digit bug (issue #344, fixed in PR #353) that this issue was split out
from. The site consumes the same handler — its search page and API route import
`searchTrials` from `@bionova/polaris-handlers`
(`products/polaris/site/src/app/search/page.tsx`,
`products/polaris/site/src/app/api/search/route.ts`) and forward `status`
verbatim — so the blast radius is both surfaces.

This is not a normalization bug like #344 — the tokens do not just need
reformatting. It needs a **product ruling**: what recruitment state(s) does each
documented token mean to a patient or physician? That is a search-semantics
decision, which is why this is `needs-spec` and not a mechanical fix.

## The ruling

**Each documented token names exactly one recruitment-lifecycle stage, and
matches exactly the stored value(s) that carry that stage's meaning. No token
spans more than one stage.** One token, one lifecycle meaning — because the
distinction the personas care about is precisely *which* stage a trial is in
(can I join now, versus is it running but closed).

For the seed's four states, the mapping is:

| Documented token | Recruitment-lifecycle meaning | Stored value(s) it must match |
| --- | --- | --- |
| `recruiting` | Enrolling now — the patient can act | `recruiting` |
| `active-not-recruiting` | Running but **closed** to new enrollment | `active_not_recruiting` |
| `completed` | Ended | `completed` |
| `not-yet-recruiting` *(new token)* | Approved but not yet open to enrollment | `not_yet_recruiting` |

Two decisions are pinned here because both are WHY calls, not mechanism:

**Decision 1 — `active-not-recruiting` means `active_not_recruiting` only, not an umbrella.**
The issue asks whether `--status=active-not-recruiting` should mean `active_not_recruiting`
alone or also cover `recruiting`/`not_yet_recruiting`. It means
`active_not_recruiting` **alone**. An umbrella `active-not-recruiting` that also matched
`recruiting` would collapse the one distinction both discovery personas depend
on — "enrolling now" versus "running but closed" — and would feed the Anxiety
force by surfacing closed trials under a filter the patient reads as
"available." The plain reading of the ClinicalTrials.gov term "Active, not
recruiting" is a single closed-to-enrollment stage, and that is what the token
means.

**Decision 2 — `not_yet_recruiting` gets its own documented token; it is never
folded into `recruiting`.** A stored recruitment state reachable by no
advertised filter is the same silent-gap harm as the `active` miss, one layer
up. Folding it into `recruiting` is the worst option: "not yet recruiting"
cannot be joined now, so presenting it under a "recruiting" filter is the exact
false-hope harm the Anxiety force names. It is a distinct lifecycle stage, so it
gets a distinct documented token, `not-yet-recruiting` — a user-facing filter
name, pinned here as part of the ruling. The WHAT: the state must be reachable
by its own filter and never conflated with another stage.

**Fail-safe for states the ruling does not enumerate.** The seed is generated,
so a future render could carry a recruitment state not in the table above. A
stored state with no documented token must still appear in **unfiltered**
results (it does today) and must never be silently claimed by a narrower token.
A token must match only the state(s) it names — never a catch-all — so an
unmapped state simply is not reachable by a filter until a token is defined for
it, rather than being mis-surfaced under an existing one. This is the same
fail-safe principle raised for the screener's status handling in
[#298](https://github.com/forwardimpact/bionova-apps/issues/298) (its spec, 280,
is in draft): an unrecognized status must never be silently mis-surfaced.

## Scope

**In scope:** the `--status` filter's token-to-stored-value semantics in
`searchTrials`, and the documented token set in the CLI definition. Both
surfaces that consume the handler (CLI and site) inherit the fix.

The site's status dropdown is a distinct in-scope surface. The hard-coded
`<option>` set in `products/polaris/site/src/components/search-form.tsx`
(lines 52-55) is a persona-facing vocabulary surface, not shared-handler logic.
Handler inheritance covers the filter's *semantics* only — it does not reach the
dropdown's options or labels. Today that dropdown offers `recruiting`, `active`,
and `completed`, so `not-yet-recruiting` is unreachable on the web and the
`active` option reads as an umbrella. The dropdown's vocabulary is corrected
under this spec so the web surface offers the same lifecycle tokens the ruling
defines.

**Out of scope**, kept disjoint so the boundary is auditable:

| Concern | Owning work | Why out of scope |
| --- | --- | --- |
| Invalid / undocumented `--status` value gives no "no such status" signal (silent empty on a token that is not in the set) | the invalid-input-signal arc opened for `--phase` in [#358](https://github.com/forwardimpact/bionova-apps/issues/358) | This spec fixes what the *documented* tokens match; the distinct-message-on-invalid-input affordance is the generalizable sibling concern, resolved once for every filter. Naming it here prevents scope bleed. |
| The eligibility screener surfacing a trial's recruiting status (it reports "possibly eligible" for non-recruiting trials) | [#298](https://github.com/forwardimpact/bionova-apps/issues/298) (spec 280, in draft) | Screener output, not the search filter. |
| Normalizing a token's *form* (e.g. digit → `Phase N`) | fix #353 (`--phase`) | Already shipped; this spec is about *meaning*, not reformatting. |
| The CLI REPL example output rendering the raw stored value `active_not_recruiting` (`products/polaris/cli/README.md:43`) | separate display-rendering follow-up (captured, not yet specced) | Display legibility of a rendered status value, not the filter's token-to-value semantics. Related legibility item, named here so it is not mistaken as covered by this spec. |

The vendored `data/synthetic/story.dsl` is **not** edited (PROVENANCE-safe); the
mapping lives entirely in the handler and CLI surface.

## Compatibility

Clean behavioral change; no interface break. `searchTrials`'s result shape and
signature are unchanged. `--status=recruiting` and `--status=completed` keep
returning the trials they return today; `--status=active-not-recruiting` now returns the
`active_not_recruiting` trial instead of an empty result — that behavior change
is the fix, not a regression. Adding the `not-yet-recruiting` token is additive:
no existing token or result changes. No old path to remove.

## Success criteria

Each criterion names the authoritative automated check; the `just cli` line is
the human reproduction of the same behavior.

| # | Criterion | Verified by |
| --- | --- | --- |
| SC1 | `--status=active-not-recruiting` returns the `active_not_recruiting` trial, not an empty result. | handler test asserts `searchTrials({status:"active-not-recruiting"})` returns the seed's one `active_not_recruiting` trial and a total of one matching trial; repro `just cli search --status=active-not-recruiting` shows that trial |
| SC2 | `--status=active-not-recruiting` does **not** surface any `recruiting` or `not_yet_recruiting` trial — the token is not an umbrella. | handler test asserts the `status:"active-not-recruiting"` result excludes every `recruiting` and `not_yet_recruiting` trial |
| SC3 | `--status=recruiting` returns exactly the `recruiting` trials and no `not_yet_recruiting` trial. | handler test asserts the `status:"recruiting"` result is the 3 `recruiting` trials and excludes the `not_yet_recruiting` trial; repro `just cli search --status=recruiting` |
| SC4 | `--status=completed` returns exactly the `completed` trial (unchanged). | handler test asserts `searchTrials({status:"completed"})` returns the seed's one `completed` trial and a total of one matching trial |
| SC5 | The `not_yet_recruiting` state is reachable by its own documented token and matches only that state. | handler test asserts a `not-yet-recruiting` token returns the `not_yet_recruiting` trial and no other; CLI definition documents the token; repro `just cli search --status=not-yet-recruiting` |
| SC6 | A stored status matched by no documented token still appears in an unfiltered search and is never surfaced by a narrower token. | handler test asserts an unfiltered search returns all six trials, and — for every documented token — asserts the result contains only trials whose stored status is in that token's mapping, so no token acts as a catch-all |
| SC7 | The vendored seed is unchanged. | `git diff` shows no change under `data/synthetic/`; PROVENANCE check passes |
| SC8 | The site status dropdown (`products/polaris/site/src/components/search-form.tsx` status `<select>`) offers a `not-yet-recruiting` option — today unreachable on the web — and its `active` option is renamed to `active-not-recruiting`, or, if a short value is kept, its visible label carries the closed-to-enrollment meaning (e.g. "Active — not accepting new patients"). | component/UI test asserts the status `<select>` includes an option reaching the `not_yet_recruiting` state and that the closed-to-enrollment option's value or label matches the ruling's `active-not-recruiting` meaning |
| SC9 | The CLI `status` option description (`products/polaris/cli/src/definition.js:53`) names the new token set and carries the closed-to-enrollment meaning, not a bare `(recruiting|active|completed)` token list. | inspection: the `status` option description names `active-not-recruiting` (with its closed-to-enrollment meaning) and `not-yet-recruiting`, replacing the old three-token list |

— Product Manager 🌱
