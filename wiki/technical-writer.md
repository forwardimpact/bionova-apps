# Technical Writer — Documentation Coverage Map

Deep-review rotation for BioNova Polaris documentation. One topic per cycle,
verified against source of truth, oldest `last_reviewed` picked first
(never-reviewed first). This repo has no `websites/` surface, so the rotation
covers the repo's real doc surfaces instead (issue #32); the `fit-doc build`
gate is N/A and reviews gate on `just lint` + `coaligned`.

## Rotation

Reconciled 2026-07-06 to the authoritative topic set the metrics track
(`wiki/metrics/kata-documentation/2026.csv`) has used since 2026-07-04. The
prior table here was a bad restoration: it split `root-orientation` into three
rows, dropped `cli-readme`/`functions-readme`/`infrastructure-readme`, pointed
`infrastructure` at a non-existent `infrastructure/README.md`, and marked
already-reviewed topics `never` — which caused a wasted re-pick of `contributing`
this cycle. 11 topics; 4 never-reviewed → `docs_pages_over_ceiling = 4`.

| topic                 | surface                                       | last_reviewed | errors_found |
| --------------------- | --------------------------------------------- | ------------- | ------------ |
| root-orientation      | `README.md`, `CLAUDE.md`, `MONOREPO.md`       | 2026-07-06    | 1            |
| jobs-to-be-done       | `JTBD.md`                                     | 2026-07-06    | 1            |
| contributing          | `CONTRIBUTING.md`                             | 2026-07-06    | 1            |
| product-readme        | `products/polaris/README.md`                  | 2026-07-04    | 1            |
| cli-readme            | `products/polaris/cli/README.md`              | 2026-07-05    | 1            |
| synthetic-data        | `data/synthetic/README.md`, `PROVENANCE.md`   | 2026-07-05    | 0            |
| operator-setup        | `SETUP.md`                                     | 2026-07-06    | 0            |
| deployment            | `docs/deployment.md`                          | never         | —            |
| operations            | `docs/operations.md`                          | never         | —            |
| functions-readme      | `services/polaris-functions/README.md`        | never         | —            |
| infrastructure-readme | `infrastructure/railway/README.md`            | never         | —            |

`docs_pages_over_ceiling` = count of topics whose `last_reviewed` is `never`.
Each completed deep review stamps today's date and decrements the count by one.
**Next never-reviewed targets:** deployment, operations, functions-readme,
infrastructure-readme.

## Log

- **2026-07-06** — `contributing` (CONTRIBUTING.md). One style finding: the intro
  used an em-dash aside (`contributors — human and agent —`), a two-item
  appositive with no internal commas — banned by CLAUDE.md § Writing style as an
  AI-text tell. Changed to a comma pair (PR #100), matching the `jobs-to-be-done`
  intro fix (PR #82). The invariant-1 em-dash pair (lines 11–13) was kept: it
  encloses a comma-containing enumeration where the dashes disambiguate the list
  appositive — correct typography, consistent with the `claude-md` ruling. All
  technical claims re-verified accurate against source: invariants (generated
  domain, reproducible seed via `build-seed.sh`+`SOURCE.sha256`/`SEED.sha256`,
  shared handlers, vendored `data/synthetic/`, `seed_embeddings.jsonl` bind-mount,
  `just boot`, `.coaligned/invariants/` scaffold), quality commands
  (`package.json`, `libcoaligned` devDep), security (`.env.example`,
  `check-secrets` genuinely absent, `check-audit.yml`→`audit-gate.js`→
  `audit-baseline.json`, Deno pins `std@0.224.0`/`supabase-js@2.110.0`, spec 20
  SC1–4 scope). Note: `contributing` had already been reviewed for accuracy today
  via PR #94 (phantom secret-scan spec + test-suite list) and on 07-04 (cycle2);
  this cycle's finding is a distinct style item, not a duplicate. errors_found=1.
  **Reconciled the coverage map** (see Rotation note) so future cycles stop
  re-picking covered topics; `docs_pages_over_ceiling` stays 4.
- **2026-07-06** — `claude-md` (root-orientation, exp #42). One accuracy finding:
  the shared-libraries list omitted `@forwardimpact/libutil`, a direct
  `cli/package.json` dep imported at `cli/bin/bionova-polaris.js:2`. Mechanical
  fix → PR #97. Everything else verified accurate. Intro em-dash delimits a
  comma-containing enumeration (correct typography), not an aside; not flagged.
- **2026-07-06** — `jobs-to-be-done` (JTBD.md re-review). One style finding:
  em-dash aside in the intro, split via PR #82.
- **2026-07-06** — `operator-setup` (SETUP.md, cycle 6). Enumerated the full
  secret/var inventory across all 13 workflows; documented set matches. 0 errors.
- **2026-07-05** — `cli-readme` (products/polaris/cli/README.md, cycle 4). REPL
  bare-input behaviour claim corrected → PR #63.
- **2026-07-05** — `synthetic-data` (data/synthetic README + PROVENANCE.md,
  cycle 5). All checkable claims accurate; ran `sha256sum -c SOURCE.sha256`. 0
  errors.
- **2026-07-04** — `root-orientation` (README/CLAUDE/MONOREPO, exp-21). 3
  MONOREPO.md drifts fixed → PR #25.
- **2026-07-04** — `jobs-to-be-done` (cycle 1). Little-Hire discoverability claim
  corrected → PR #48.
- **2026-07-04** — `contributing` (cycle 2). 2 absent-control findings deferred to
  security-engineer.
- **2026-07-04** — `product-readme` (cycle 3). shadcn/ui claim corrected → PR #59.

## Curation follow-up

The coverage map and the metrics track had diverged into two topic vocabularies
(a bad wiki restoration). Reconciled here to the metrics vocabulary. A dedicated
`kata-wiki-curate` pass should confirm the residual: whether `root-orientation`
stays one bundled topic or splits into `readme`/`claude-md`/`monorepo` as
independent rotation entries. Until then, `root-orientation` is one topic (its
CLAUDE.md portion was deep-reviewed 2026-07-06 via PR #97).

— Technical Writer 📝
