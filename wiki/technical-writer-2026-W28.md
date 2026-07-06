# Technical Writer — 2026-W28

## 2026-07-06

### Decision

**Surveyed:** ask#7 (facilitator): sharpen approval-surface prose — name the now-open design PRs #78 (spec 30) / #79 (spec 50), keep guardrail verbatim, ledger untouched, keep claim at aggregate 7→0 (do NOT inherit corrected per-spec counts: postcss GHSA-qx2v is spec 50 not 30; spec 30 baselines 2 crit/high). On pull found the wiki remote had REGRESSED: my STATUS Approval-context section dropped by a downstream commit and storyboard-2026-M07.md untracked/absent from origin/master (concurrent writers pushed incomplete trees; conservation guard only protects MEMORY.md)

**Alternatives:** —

**Chosen:** Reset local to clean origin/master (5892207, preserving staff's row-format consolidation; stale local 6cebf97 discarded, recoverable via reflog). Re-created the Approval-context section on the FRESH STATUS.md and restored storyboard-2026-M07.md from backup, both with sharpened prose naming PR #78/#79 and the human design-approval decision. Dropped per-spec advisory counts to the aggregate '7→0 across the coupled pair'. fit-wiki audit: only known baseline errors, zero new from my prose; ledger TSV untouched.

**Rationale:** The countermeasure is only live if the PR numbers sit at the approval surface (approver one click from the artifact). Content regression by concurrent writers is a conservation problem to escalate — STATUS.md and storyboard are unprotected by the push guard.

### Documentation review — jobs-to-be-done (exp #42 cycle 1)

Deep-reviewed JTBD.md against source of truth. Accuracy clean: personas agree across JTBD.md, products/polaris/README.md, CLAUDE.md; rg '<job ' finds all three tags; each block carries its Big and Little Hire; in-flight specs 10/60/70 map onto existing Little Hires. One style finding: em-dash aside in the intro, banned by CLAUDE.md writing style, split to two sentences (PR #82). errors_found=1. Coverage map + metrics stamped; docs_pages_over_ceiling 10->9. fit-doc build N/A (no websites/, issue #32); gated on lint + coaligned.

## 2026-07-06

### Decision

**Surveyed:** During ask#7 landing, found systemic content regression on the wiki remote: MEMORY.md's entire ## Cross-Cutting Priorities section (4 shared rows) wiped by 8e857ff (a 'claim spec 20' commit that recreated MEMORY.md as a 7-line stub from an incomplete working tree); storyboard-2026-M07.md untracked/dropped from origin/master; technical-writer weekly log dropped too. Pattern: agents pushing partial working trees clobber shared files. The fit-wiki push conservation guard only protects MEMORY.md (its refusals cite MEMORY.md only), so STATUS sections + storyboard + logs are unprotected.

**Alternatives:** —

**Chosen:** Restored MEMORY ## Cross-Cutting Priorities verbatim from last-good 5833e81 (11:17), preserving current Active Claims; guard passed (pure add). Restored storyboard + re-created STATUS Approval-context on the FRESH origin base (kept staff's row-format consolidation). Fixed pre-existing APM-row table pipe (O_CREAT/O_EXCL) so it audits 5 cells. All verified on origin/master.

**Rationale:** Restoration is futile if clobbering continues — the #44/#46 countermeasure already got dropped once. Root cause (incomplete-tree pushes + guard covering only MEMORY.md) needs an owner; escalating to facilitator/coach as a conservation obstacle.

### Documentation review — claude-md (exp #42 cycle 2)

Deep-reviewed CLAUDE.md against source. One accuracy finding: the shared-libraries list `(libcli, libui, libformat, libtemplate, librepl)` omitted `@forwardimpact/libutil` — a direct `products/polaris/cli/package.json` dependency imported in the CLI entrypoint (`cli/bin/bionova-polaris.js:2`, `createDefaultRuntime`; typed `Runtime` at `cli/src/definition.js:21`), as load-bearing as the already-listed `librepl`. Mechanical fix → PR #97 (`fix/doc-claude-md-2026-07-06`, independent of the CONTRIBUTING PR #94). Everything else verified accurate against source: personas match `products/polaris/README.md`; directory shape; `just boot`=`seed up setup`; `lint/test/smoke` recipes; `just cli search --condition=diabetes` is the verbatim `definition.js:56` example; `rg '<job '` finds all three tags; `FIT_TERRAIN` matches `build-seed.sh:13-18`; Bun 1.2+ matches `engines`. No audience mixing (CLAUDE.md is agent-facing, so `src/` paths are in-scope). Intro em-dash delimits a comma-containing enumeration (correct typography), not an AI-tell aside — not flagged. errors_found=1; coverage map + metrics stamped. Gates: `eslint .` clean; `lint:deno` unrunnable locally (no `deno` binary) and `coaligned` fails pre-existing in `memory-protocol.md` (both reproduce with my edit stashed, unrelated to a markdown change) — CI runs the full gate. `fit-doc build` N/A (issue #32).

**Curation flag (not mine to fix this cycle):** the current `wiki/technical-writer.md` rotation table shows only `jobs-to-be-done` + `claude-md` at age 0 and everything else `never`, but the pre-07-06 metrics history records `root-orientation`, `contributing`, `product-readme`, `cli-readme`, `synthetic-data`, `operator-setup` all reviewed 07-04/05/06 under different topic ids. The coverage map is a fresh/restored table whose topic vocabulary diverged from the metrics series — a pool-reset that a `kata-wiki-curate` pass should reconcile so `docs_pages_over_ceiling` stays meaningful. Left the existing 07-06 `docs_pages_over_ceiling=4` row untouched (once-per-day).

— Technical Writer 📝

### Closed

Run closed 2026-07-06.

## 2026-07-06

### Documentation review — contributing (CONTRIBUTING.md)

Coverage map showed `contributing` as never-reviewed, so I picked it. One style
finding: the intro used an em-dash aside — `contributors — human and agent —` —
a two-item appositive with no internal commas, the exact construct CLAUDE.md §
Writing style bans as an AI-text tell. Changed to a comma pair (PR #100),
consistent with the JTBD intro fix (PR #82). The invariant-1 em-dash pair (lines
11–13) was kept: it encloses a six-item comma-containing enumeration where the
dashes disambiguate the list appositive — correct typography, consistent with
the `claude-md` ruling. All technical claims re-verified accurate against source:
invariants (generated domain, reproducible seed via `build-seed.sh` +
`SOURCE.sha256`/`SEED.sha256`, shared handlers, vendored `data/synthetic/`,
`seed_embeddings.jsonl` bind-mount, `.coaligned/invariants/` scaffold), quality
commands, security (`.env.example`, `check-secrets` genuinely absent from
`.github/workflows/`, `check-audit.yml`→`audit-gate.js`→`audit-baseline.json`,
Deno pins `std@0.224.0`/`supabase-js@2.110.0`, spec 20 SC1–4 scope). errors_found=1.

**Not a duplicate:** `contributing` was already reviewed for accuracy today via
PR #94 (MERGED — phantom secret-scan spec + `bun run test` suite list) and on
07-04 (cycle2). PR #94 was an accuracy pass and did not touch the intro; my
finding is a distinct style item. `bun run lint` covers JS + Deno only, not
markdown; `npx coaligned` introduces no new finding from this change (a
pre-existing line/word-budget breach in the apm-managed
`.claude/agents/memory-protocol.md` is unrelated and untouched, reproduces with
my edit reverted).

### Coverage-map reconciliation (curation)

The pool-reset the `claude-md` entry flagged has now caused concrete waste: the
current `wiki/technical-writer.md` was a bad restoration whose topic vocabulary
diverged from the authoritative metrics track — it split `root-orientation` into
three rows, dropped `cli-readme`/`functions-readme`/`infrastructure-readme`,
pointed `infrastructure` at a non-existent `infrastructure/README.md` (real
surface: `infrastructure/railway/README.md`), and marked already-reviewed topics
`never`, which is why this cycle re-picked an already-covered topic. Rebuilt the
rotation to the authoritative 11-topic set the metrics CSV has used since
2026-07-04, with `last_reviewed` dates and `errors_found` recovered from the
metrics rows. 11 topics, 4 never-reviewed → `docs_pages_over_ceiling = 4`
(unchanged, consistent with the existing 07-06 row). **True next targets:**
deployment, operations, functions-readme, infrastructure-readme. Residual for a
dedicated `kata-wiki-curate` pass: confirm whether `root-orientation` stays one
bundled topic or splits into `readme`/`claude-md`/`monorepo`.

### Closed

Run closed 2026-07-06.

— Technical Writer 📝
