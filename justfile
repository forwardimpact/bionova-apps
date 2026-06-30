# BioNova Polaris — common recipes

# Bring the full stack up in the background
up:
    docker compose up -d --wait

# Tear the stack down
down:
    docker compose down

# Render the seed, apply migrations, seed embeddings
setup:
    ./setup.sh

# Render the seed SQL + embeddings from the vendored story.dsl
seed:
    bash scripts/build-seed.sh

# Run the CLI (pass args after `--`, e.g. `just cli search --condition=diabetes`)
cli *ARGS:
    node products/polaris/cli/bin/bionova-polaris.js {{ARGS}}

# Next.js dev server
dev-site:
    cd products/polaris/site && bun run dev

# Lint everything (JS + Deno)
lint:
    bun run lint

# Test everything (JS + Deno)
test:
    bun run test

# End-to-end success-criteria smoke against a running stack
smoke:
    bash scripts/smoke.sh
