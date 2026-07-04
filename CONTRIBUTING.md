# Contributing to BioNova Polaris

How contributors — human and agent — work in this repository. [CLAUDE.md](CLAUDE.md)
orients you (what, who, where); this file governs (rules, commands, policy).
Read it before your first commit.

## Invariants

Rules that hold for every contribution. Each is checkable.

1. **The domain is generated, never authored.** No patient-facing string —
   explainer, FAQ, consent summary, site description, patient story, therapy
   description — is hand-written in a handler, template, or migration. Every one
   is rendered from `data/synthetic/story.dsl` into a seed table and read back at
   runtime. Changing the domain means editing the DSL upstream, not editing the
   app. See [MONOREPO.md § Source of truth](MONOREPO.md).
2. **The seed is reproducible.** `fit-terrain build` is credential-free (the
   prose cache is committed; `build` makes no LLM calls) and reproduces the seed
   byte-for-byte. Verify against `data/synthetic/SEED.sha256`; never edit a
   rendered SQL migration or embeddings JSONL by hand.
3. **Both surfaces share one brain.** `cli/` and `site/` dispatch into the same
   `products/polaris/handlers/`. Surface code renders results; it holds no
   business logic.
4. **`data/synthetic/` is vendored verbatim.** `story.dsl` and `prose-cache.json`
   come from the Forward Impact monorepo unchanged. Record provenance in
   `data/synthetic/PROVENANCE.md`; do not fork them here.
5. **Render the seed before the stack comes up.** `polaris-functions` bind-mounts
   `data/synthetic/seed_embeddings.jsonl`, so the file must exist on the host
   before `docker compose up`. `just boot` runs the steps in order.
6. **Dates are absolute.** Write `2026-06-30`, not "today" or "last week".
   Relative time rots the moment it is committed.

Repository-specific declarative checks belong in `.coaligned/invariants/` as
`*.rules.mjs` modules, run under `bun run coaligned invariants`. No rule modules
exist yet; the directory is scaffolded and its README names the first candidate.

## Quality commands

Run before every commit. The offline suites need no running stack:

```sh
bun run lint          # eslint (JS) + deno lint (edge functions)
bunx tsc --noEmit     # typecheck
bun run test          # handlers + CLI + site + edge functions
bun run coaligned     # instruction layers, jobs, invariants
```

The `coaligned` CLI ships as the published `@forwardimpact/libcoaligned`
package (its bin is `coaligned`). It is pinned as a devDependency, so `bun run
coaligned` resolves the local bin and the check runs reproducibly on a clean
runner.

End-to-end success criteria (SC1–SC7) need the full stack up:

```sh
just boot                          # render seed, compose up, setup.sh
SMOKE_DESTRUCTIVE=1 bash scripts/smoke.sh
```

## Git workflow

- Branch off `main`; never commit to `main` directly. Open a pull request.
- Use [conventional commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `chore:`).
- One concern per pull request. Keep the diff reviewable.

## Security

- Apache-2.0 licensed; this is a public repository. Assume every commit is world
  readable, forever.
- Real secrets live in `.env` (gitignored). `.env.example` carries placeholders.
- The Supabase JWT keys committed for the local stack are the well-known public
  demo keys, not secrets. Never add a real key.
- Scan for secrets before you push. Run `gitleaks` locally, resolve every finding, and document any verified false positive in the pull request. Automated CI enforcement — a `check-secrets` gate with an allowlist tuned for the vendored synthetic data and the well-known demo keys — is tracked in the CI secret-scan gate spec.

### Dependency audit gates

CI checks pull requests for dependency advisories. One policy governs every
contributor. The npm and Bun gate is live now; a matching Deno gate is planned.
The check runs in CI, so it applies no matter how you work locally. Only the
command you run to reproduce it changes with your runtime.

A new critical or high advisory that is not in the committed baseline fails the
build. Moderate and low advisories are printed in the job log and never block.

The npm and Bun dependencies are checked by `.github/workflows/check-audit.yml`,
which runs `scripts/audit-gate.js`. That script diffs `bun audit` against
`security/audit-baseline.json` and fails only on a critical or high advisory
that is not baselined. If the advisory service is unreachable the check warns
and passes, so a registry outage never blocks every pull request. Reproduce it
locally:

```sh
bun scripts/audit-gate.js
```

A matching gate for the Deno dependencies in `services/polaris-functions` is
planned but not yet live. `bun audit` cannot see those dependencies, so the gate
will run in the `check-edge` workflow. It will read the two top-level pinned
versions, `deno.land/std@0.224.0` and `@supabase/supabase-js@2.110.0`, and look
each up against a known-advisory source by ecosystem and version. It will fail
on an un-accepted critical or high, using the same baseline model as the npm
check. The work is tracked in the CI audit-gate spec (spec 20, SC1–4).

The planned Deno check will cover the top-level pins only. It will not scan the
transitive tree. The pinned dependencies are imported over URLs, so the Deno
lockfile carries no auditable package tree, and a graph scanner would report
clean on the very dependency the check exists to watch. A green result there
will never be assurance about the transitive tree. Full graph coverage needs the
edge functions moved from esm.sh URLs to `npm:` specifiers, which is tracked as
a separate spec.

To accept a critical or high advisory you will not fix yet, add it to the
baseline for that check, keyed by advisory id, with a `reason` and an
`accepted_on` date, under security-engineer review. Acceptance is always
explicit, dated, and reviewed. The baseline only ever narrows; it never widens
on its own.

When a dependency bump resolves an advisory, remove its baseline entry in the
same pull request. The check prints a warning about stale entries to prompt
this.

## Checklists

<read_do_checklist goal="Load the constraints before changing the domain or seed">

- [ ] Confirm the change belongs in `story.dsl` upstream, not in app code.
- [ ] Confirm `FIT_TERRAIN` points at a `fit-terrain` with `--output-root`.
- [ ] Re-vendor `story.dsl` + `prose-cache.json` and update `PROVENANCE.md`.
- [ ] Render the seed before bringing the stack up.

</read_do_checklist>

<do_confirm_checklist goal="Verify completeness before opening a pull request">

- [ ] `bun run lint`, `bunx tsc --noEmit`, and `bun run test` pass.
- [ ] `bun run coaligned` passes with no findings.
- [ ] Rendered seed matches `data/synthetic/SEED.sha256`.
- [ ] `SMOKE_DESTRUCTIVE=1 scripts/smoke.sh` passes against a fresh stack.
- [ ] No hand-authored domain content, no real secret, dates are absolute.

</do_confirm_checklist>
