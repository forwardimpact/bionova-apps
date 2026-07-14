# Provenance — data/synthetic

This directory holds the domain source of truth for BioNova Polaris, vendored
**verbatim** from the Forward Impact monorepo. The seed SQL and embeddings are
rendered locally from these files; they are never authored or committed.

## DSL source

- Generating repo: `forwardimpact/monorepo`
- Provenance SHA: `ae481f82456d4616b388fe0a2e0058bd12ca8816` (on `main`)
- Vendored verbatim: `story.dsl` (`seed 42`) + `prose-cache.json`
- Integrity: `SOURCE.sha256` (run `sha256sum -c SOURCE.sha256` here)

`story.dsl` is byte-identical to the monorepo's copy at the provenance SHA.
Editing the vendored DSL is out of scope. Domain changes are made in the
monorepo and re-vendored.

## Renderer

- Library: `@forwardimpact/libterrain` carrying spec-1160 prerequisites A
  (`--output-root`) and B (clinical prose → SQL).
- Renderer SHA: `ec2c7f87cbeca18efd3dc6e169e9ca4ecddaaf75` (monorepo `main` +
  prereq A `0c7cf238b` + prereq B `ec2c7f87c`). At vendor time these two commits
  were not yet on `main` or npm, so the seed was rendered with a local checkout.
- A+B now ship in `fit-terrain@0.1.41` on npm. It is pinned as a devDependency,
  so `bun install` drops its bin at `node_modules/.bin/fit-terrain` and
  `build-seed.sh` runs that bin by default. `FIT_TERRAIN` only needs to point at
  a local checkout to render with an unreleased build.

## Render command

```sh
# build-seed.sh runs the pinned fit-terrain devDependency by default. Override
# FIT_TERRAIN only to render with an unreleased local checkout:
export FIT_TERRAIN="node /path/to/monorepo/libraries/libterrain/bin/fit-terrain.js"
bash scripts/build-seed.sh
# which runs, in effect:
#   fit-terrain build --story data/synthetic/story.dsl \
#     --cache data/synthetic/prose-cache.json \
#     --output-root data/synthetic/.build
```

## Determinism (SC7)

`SEED.sha256` pins the rendered SQL + embeddings JSONL bytes. To verify:

```sh
bash scripts/build-seed.sh
cd data/synthetic/.build/products/polaris/site/supabase/migrations
sha256sum -c "$OLDPWD/data/synthetic/SEED.sha256"
```

Re-rendering here reproduces the anchor byte-for-byte. Running the same render in
the monorepo at the renderer SHA against the vendored DSL reproduces the same
bytes; `supabase db push` of the staged migrations then reproduces identical data.
