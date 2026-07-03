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

Repository-specific declarative checks live in `.coaligned/invariants/` and run
under `bun run coaligned invariants`.

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
- `gitleaks` runs before push. Resolve every finding; document any verified
  false positive in the pull request.

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
