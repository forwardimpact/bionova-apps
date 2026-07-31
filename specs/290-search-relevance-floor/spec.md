# Spec 290: Plain-language trial search returns a relevant shortlist, not the catalog

**Classification:** Product — serves the core discovery job on two personas'
primary path. It sharpens patient- and physician-facing search *relevance*; it
is not internal tooling.

**Persona / job:** Two personas, one broken path
([JTBD.md](../../JTBD.md)):

- **Referring Physician — *Refer in the Visit*** (Big Hire): *"Help me search
  trials on behalf of patients and share the details."* The observed failure in
  [#297](https://github.com/forwardimpact/bionova-apps/issues/297) is a
  community internist searching for a type-2-diabetes trial mid-visit.
- **Patient / Advocate — *Find a Relevant Trial***: the pull is a
  plain-language **shortlist** of actionable trials. An all-catalog result is
  not a shortlist.

## Problem

The plain-language search box is the advertised path — its placeholder is
`e.g. high blood sugar`. A patient or physician types a condition in ordinary
words; a multi-word phrase or an unrecognised token routes through semantic
search (the `isPlainLanguage` branch of `searchTrials` in
`products/polaris/handlers/src/search-trials.js`). That path applies **no
effective relevance floor**, so it returns loosely-related trials up to and
including the entire catalog:

| Query (the site's `condition` field) | Trials returned |
| --- | --- |
| `type 2 diabetes` | 4 — incl. HER2 breast cancer + COPD |
| `high blood sugar` | 4 — incl. HER2 breast cancer + COPD |
| `lung cancer` | 6 (all) |
| `banana` | 6 (all) |

The exact-catalog-id path works (`condition=diabetes-t2` → 1 trial), but no
patient or physician types `diabetes-t2`. The plain-language path is the one the
placeholder invites, and it is the one that fails.

**Root** (observed repository state pinned at `bbedbfc`, the tree the #297
reproduction ran against — not the commit that introduced the behavior). The
plain-language branch calls
`semanticConditionIds`, which takes `matches.map(m => m.condition_id)` from the
`match_conditions` RPC and passes them straight through. The RPC *does* carry a
relevance floor — `match_threshold` defaults to `0.3`, and the SQL filters
`WHERE (1 - cosine_distance) > match_threshold`. But:

1. **The floor is guessed, not measured.** The migration comment justifies `0.3`
   by asserting paraphrases "score around 0.4-0.5" — an estimate, never verified
   against the rendered seed's actual embeddings.
2. **`0.3` sits below the empirical separation point of the seed's
   embeddings.** `bge-small-en-v1.5` embeddings are anisotropic — even
   *unrelated* short English strings carry non-trivial cosine similarity — so a
   floor as low as `0.3` fails to separate related from unrelated conditions.
   The evidence is direct: `banana` (a synonym of nothing, so the keyword path
   returns zero) clears `0.3` against every condition and the RPC returns all
   six ids. The exact separation point is not asserted here — measuring it is
   Decision 3.
3. **`match_count` (default 5) is not a relevance mechanism.** Five conditions
   already span all six trials, so a top-k cut without a working floor still
   returns near-everything.
4. **The keyword (ILIKE) fallback never rescues relevance.** It fires only when
   the RPC returns *zero* rows — which, with a floor this low, never happens.

The net effect: the query is effectively ignored for relevance. The clinician
must eyeball every result to avoid pointing a patient at the wrong disease,
feeding the job's **Anxiety** force (recommending a poor-fit trial); the patient
gets the catalog instead of a shortlist.

**The trade-off this spec must hold.** The placeholder deliberately invites
near-miss queries — `high blood sugar` must still resolve to diabetes. A floor
set too aggressively silently breaks recall on exactly the queries the product
advertises. The fix must **kill the nonsense-matches-everything failure while
protecting near-miss recall.** That is a precision/recall operating point, not a
one-line threshold bump.

## Scope

This spec covers plain-language search **relevance** only: the condition-
resolution step of `searchTrials` and the `match_conditions` RPC it calls. It
resolves three decisions.

### Decision 1 — the relevance floor must be effective and set by measurement

There must be a floor that separates conditions a competent clinician would call
*related* to the query from those they would call *unrelated*, and its value must
be chosen by measuring the actual rendered seed embeddings — not asserted. The
floor is a WHAT: an unrelated condition must fall below it; a genuine paraphrase
must clear it. The exact numeric value and where the floor is enforced are design
decisions; the **requirement** this spec fixes is a floor that empirically clears
the two probe classes named in Decision 3.

### Decision 2 — below-floor fails to empty, never to top-k or the catalog

When no condition clears the floor, the plain-language path returns **an empty
result** ("no trials matched your search"). It must return **neither top-k nor
the catalog**. That is the WHAT; *how* the empty result is produced is a design
decision.

**Top-k is explicitly rejected** as the below-floor behavior: with the seed's
five-of-six condition span, returning the top-k regardless of score is the
all-catalog harm by another name. An empty result is the honest answer to a
query with no relevant trial; it is strictly better than a wrong shortlist for
both the Anxiety force and the shortlist pull.

**Recall is the floor's job, not the keyword fallback's.** The existing keyword
(ILIKE) fallback is exact-substring over condition names and synonyms; it can
only catch phrases already stored in the seed (e.g. `high blood sugar` is a
listed `diabetes-t2` synonym). Free-form paraphrases that are *not* stored
synonyms are exactly why semantic search exists, and preserving their recall is
Decision 1's floor, not the fallback. This spec does not expand the keyword
fallback into a below-floor rescue; its current trigger (embedding service
unavailable) is unchanged.

### Decision 3 — the floor is verified against the seed's actual embeddings

The seed embeddings are not checked in: the rendered `seed_embeddings.jsonl` is
gitignored, and the `condition_embeddings` table it populates is built at setup
time by TEI. So the chosen floor must be backed by a **repeatable
verification** — a checked-in artifact (test or script) that, against the actual
seed, asserts the floor cleanly separates a labelled probe set:

- **Positives (must clear the floor):** at minimum `type 2 diabetes` →
  `diabetes-t2`, `high blood sugar` → `diabetes-t2`, and — critically — at least
  one free-form paraphrase that is **not** a stored synonym (so it exercises the
  embedding path the floor governs, not the exact-substring keyword path), plus
  one paraphrase per other seeded condition.
- **Negatives (must fall below the floor):** at minimum `banana`, and one query
  naming a *different* seeded disease that must not surface an unrelated one
  (e.g. a diabetes query must not return the breast-cancer or COPD condition).

The floor is justified by this separation, not by narrative.

### Out of scope — the screener defects (kept disjoint)

This spec does **not** touch the eligibility screener. Named explicitly so the
boundary is auditable:

| Issue | Owning work | Defect | Why out of scope |
| --- | --- | --- | --- |
| [#298](https://github.com/forwardimpact/bionova-apps/issues/298) | spec 280 | recruiting status in the result | screener output, not the search path |
| [#130](https://github.com/forwardimpact/bionova-apps/issues/130) | spec 150 | criteria-screening depth | screener logic, not condition resolution |
| [#300](https://github.com/forwardimpact/bionova-apps/issues/300) | fix #302 | screener default answers | screener defaults, not search |

None of these touch condition resolution or `match_conditions`.

## Compatibility

Clean behavioral change; no interface break. The `searchTrials` result shape and
the `match_conditions` signature are unchanged. The *behavior* change — nonsense
and unrelated queries now return fewer trials or none — is the fix, not a
regression. No old path to remove.

## Success criteria

Each row names the authoritative automated check; the `just cli` line is the
human reproduction of the same behavior.

| # | Criterion | Verified by |
| --- | --- | --- |
| SC1 | A nonsense query returns no trials: `condition=banana` yields `total: 0`. | handler test asserts `searchTrials({condition:"banana"})` returns `total: 0`; repro `just cli search --condition=banana` shows zero trials |
| SC2 | A near-miss query still resolves: `condition="high blood sugar"` returns the diabetes trial(s) and **no** unrelated-disease trial (no breast-cancer or COPD trial in the result). | handler test asserts the result's `conditions` are all `diabetes-t2` and the trial set excludes `her2-combo` and `copd-inhaler`; repro `just cli search --condition="high blood sugar"` |
| SC3 | A direct plain-language condition query returns a shortlist, not the catalog: `condition="type 2 diabetes"` returns only diabetes-linked trials, excluding the HER2 breast-cancer and COPD trials named in #297. | handler test asserts the result excludes `her2-combo` and `copd-inhaler`; repro `just cli search --condition="type 2 diabetes"` |
| SC4 | The relevance floor is verified against the actual rendered seed: a checked-in test or script embeds the labelled probe set and asserts every positive clears the floor and every negative falls below it. | the verification artifact runs green under `just test` |
| SC5 | When the embedding service is unavailable, the plain-language path degrades to the keyword fallback and a nonsense token returns `total: 0` — never the catalog. | handler test stubs `embeddings.embed` to throw, asserts `searchTrials({condition:"banana"})` returns `total: 0` and a stored-synonym query (e.g. `"high blood sugar"`) returns only `diabetes-t2` trials |
| SC6 | No screener behavior changes: eligibility-precheck and screener tests are unaffected by this change. | `just test` for the screener/eligibility suites passes unchanged |

— Staff Engineer 🛠️
