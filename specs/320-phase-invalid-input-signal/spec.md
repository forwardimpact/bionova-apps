# Spec 320 — `--phase` fail-loud signal on unrecognized input

**Issue:** #358
**Classification:** Product-aligned — changes patient-facing search behavior on
the Patient/Advocate and Referring Physician surfaces.

## Problem

Trial search accepts a `phase` filter on every surface (CLI `--phase`, the
site's free-text phase field). When the value names a phase the catalog does not
carry, the search returns nothing and renders the **same view** as a real phase
that simply has no matching trials right now. The user cannot tell a typo from an
empty result.

Evidence, confirmed against merged code (`5c2d568`), not prose:

| Input | Resolved filter | Result rows | Rendered view |
| --- | --- | --- | --- |
| `--phase=2` (populated) | `phase=eq.Phase 2` | ≥1 | header `Phase: 2`, trials listed |
| `--phase=2 --location=nowhere` | `phase=eq.Phase 2` + location | 0 | header `Phase: 2`, `No trials matched.` |
| `--phase=5` (no such phase) | `phase=eq.5` | 0 | header `Phase: 5`, `No trials matched.` |
| `--phase=banana` (not a phase) | `phase=eq.banana` | 0 | header `Phase: banana`, `No trials matched.` |
| `--phase=4` (documented, zero trials) | `phase=eq.Phase 4` | 0 | header `Phase: 4`, `No trials matched.` |

Two guarantees are conflated. #353 correctly bought *"invalid input matches
nothing"* (`phaseFilterValue` leaves an unrecognized value as-is so it can never
fabricate a match). It did not buy *"invalid input tells the user something."*
The zero-result path (`No trials matched.`) and the header echo of the raw input
are identical for a typo and for a legitimately empty search.

The `--phase=4` row is the boundary case this spec turns on. Phase 4 is a real
clinical concept and is *documented* by the CLI, but the catalog carries no
Phase 4 trial — so "recognized" here means **present in this catalog's phase
set**, not "is a real-world phase." Post-fix, `--phase=4` is therefore
*unrecognized input* and gets the signal (which names the phases this catalog
does carry: 1, 2, 3), not the silent empty. The table above is current behavior;
the desired split is pinned in Scope and SC1/SC1b/SC2 below.

Two subtleties make a naive fix wrong:

1. **The documented enum lies.** Help text and the `phaseFilterValue` regex both
   say `1|2|3|4`, but the rendered seed carries only **Phase 1, 2, 3** (verify:
   `rg -oN 'Phase [0-9]' data/synthetic/story.dsl | sort | uniq -c`). A message
   that reads "valid phases are 1–4" would itself mislead — it advertises a
   Phase 4 the catalog cannot return.
2. **The domain is generated, not authored.** Per
   [CLAUDE.md](../../CLAUDE.md), the entire domain renders from
   `data/synthetic/story.dsl`; there is no hand-authored domain content. A
   hardcoded `[1-4]` validator would be hand-authored domain content living
   outside the source of record — the same drift class the recent
   phase-normalization and phase-render fixes (#353, #357) cleaned up. The set of
   searchable phases must be derived from the rendered domain, not pinned in
   code. `story.dsl` is the ultimate source of record; at run time that record is
   the seeded trials data rendered from it — the searchable-phase set is
   derivable from the seed at run time, never read from the DSL file live.

## Why it matters (JTBD)

- **Patient / Advocate — Find a Relevant Trial.** The named **Anxiety** force is
  "getting my hopes up about a trial I will not qualify for." This gap causes the
  *inverse* harm: false discouragement. A mistyped phase reads as "there are no
  trials for me," pushing toward the **Competes-With** of "giving up and
  waiting."
- **Referring Physician — Refer in the Visit.** With three minutes left in an
  appointment, a silent empty on bad input wastes scarce time and nudges toward
  the **Competes-With** of "not referring at all."
- **Clinical Development Staff — Keep Listings True** is intentionally not
  served here. That job is about the *accuracy of what is listed*; this spec
  changes only how *search input* is echoed back. No listing content changes, so
  the staff job is untouched by design, not overlooked.

## Scope

**In scope**

- Trial search **recognizes** a `phase` value by resolving it against the set of
  phases present in the rendered domain. Recognition (is this a phase the catalog
  carries?) is a distinct step from input-shape normalization (mapping a bare
  digit to the stored `Phase N` string). A value that, once normalized, does not
  name a phase in the domain set is **unrecognized input**, distinct from a
  populated phase whose filtered search happens to return nothing. When
  normalization and recognition disagree — e.g. `4` normalizes to a well-formed
  `Phase 4` that the catalog does not carry — recognition wins and the signal
  fires.
- The existing digit-shape normalization (`phaseFilterValue`, a `[1-4]` map to
  `Phase N`) may remain as an input convenience, but it must not be the source of
  the *recognized* or *advertised* phase set. That set derives from the rendered
  domain. SC5's "no hardcoded enumeration" bars a new hand-authored list as the
  recognition/advertised source; it does not by itself mandate removing the
  pre-existing shape map, whose disposition is a design decision.
- Unrecognized input produces a distinct, plain-language signal that (a) states
  the input was not a recognized phase and (b) names the phases actually
  available to search. The available-phase list is derived from the rendered
  domain — never a hardcoded literal.
- The unrecognized-input outcome is carried on the search result returned by the
  surface-agnostic `searchTrials` handler, so every consuming surface renders it
  its own way. Both phase-filtering surfaces present the signal: the CLI `--phase`
  option and the site's free-text phase field (`search-form.tsx`). The two
  surfaces do not share a render path — the CLI renders a result template, the
  site renders the return object directly — so the shared seam is the
  `searchTrials` result contract, which must carry the outcome. The exact field
  shape is a design decision.
- The CLI `--phase` help description is reconciled with the source of record so
  it no longer advertises a fixed `1|2|3|4` list the catalog cannot honor.

**Out of scope**

- Widening the filter or matching more loosely — this adds a validation signal,
  it does not change what matches. #353's fail-quiet-on-match invariant stands:
  a recognized phase that yields no rows still renders the existing empty view,
  never a fabricated match.
- Case-insensitive word-matching of phase names — explicitly declined on #352.
- Extending the fail-loud pattern to the other filters (`--condition`,
  `--status`, `--location`), which fail quiet today. Whether this new pattern
  should generalize is a separate product decision; this spec establishes it for
  `phase` only and does not commit the others.
- The site status `<select>` and `--status` vocabulary — owned by spec 310.

## Compatibility

Additive behavior change, no clean break. A search that previously rendered
`No trials matched.` for an unrecognized phase now renders the distinct
unrecognized-input signal instead; a recognized-but-empty search is unchanged.
No option, flag, or output field is removed. The `phaseFilterValue`
fail-quiet-on-match contract landed by #353 (issue #344) is preserved, not
reversed — this spec adds a fail-loud-on-unrecognized-input signal beside it.

## Success criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| SC1 | A `phase` value that does not name a phase present in the rendered domain produces a distinct signal, visibly different from the empty-result view. | CLI run: `just cli search --phase=banana` and `--phase=5` render the unrecognized-input signal, not `No trials matched.` |
| SC1b | A phase the CLI documents but the catalog does not carry (today: `4`) is treated as unrecognized input, not as a recognized-but-empty phase. | CLI run: `search --phase=4` renders the unrecognized-input signal naming phases 1, 2, 3 — not `No trials matched.` |
| SC2 | A `phase` value that names a phase present in the domain but whose combined search returns nothing still renders the existing empty view. | CLI run: `search --phase=2 --location=nowhere` renders `No trials matched.`, not the unrecognized signal. |
| SC3 | A recognized phase with matching trials is unchanged. | CLI run: `search --phase=2` lists trials; `just test` green. |
| SC4 | The unrecognized-input signal names the phases actually available, derived from the rendered domain — it does not advertise a phase the catalog cannot return (e.g. no bare "1–4"). | The signal lists exactly the phases present in the seeded domain (today: 1, 2, 3 — cross-check `rg -oN 'Phase [0-9]' data/synthetic/story.dsl | sort -u`). Re-render the seed with the phase set changed and the signal changes with no code edit. |
| SC5 | No hardcoded phase enumeration is introduced in application code. | Code review of the diff; `rg -n 'Phase\s*[0-9]\|1[ \|]*2[ \|]*3\|\[1-4\]' products/` surfaces no new literal phase list acting as the recognition or advertised source (the pre-existing `phaseFilterValue` shape map, whose disposition Scope leaves to design, is not a new addition). |
| SC6 | The CLI `--phase` help description no longer advertises a phase the catalog cannot honor (no fixed `1\|2\|3\|4` list). | Read the search-command `phase` help description; it names no phase absent from the seed. |
| SC7 | The site's phase field presents the distinct signal, not a silent empty results list. | Enter an unrecognized phase in the site search form; the results view renders the distinct unrecognized-input signal, not a bare "0 trials found" (the site's current `{n} trials found` copy) above an empty list. The recognized-vs-unrecognized decision — including the `--phase=4` boundary of SC1b — is carried on the `searchTrials` result contract, so it holds identically on the site; SC7 checks the site *renders* that outcome, it does not re-litigate the boundary per surface. |

## Sequencing

Implementation touches the same search path as the recently merged phase-render
fixes; #357 (the last of that series) has merged, so no open-PR conflict remains.
Design and plan may proceed. The design's first job is to name the source of
truth for the searchable-phase set, so the validator does not become the next
instance of the drift it guards against.
