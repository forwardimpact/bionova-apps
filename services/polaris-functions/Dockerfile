# Polaris edge functions — a single Deno process serving every function on
# port 8000. Kong routes /functions/v1/{name} here; the router maps the last
# path segment to a module's handle(req, env). Build context is the repo root
# (see docker-compose.yml), so paths below are repo-relative.
FROM denoland/deno:1.46.3

WORKDIR /app

# Copy the config first so the layer caches when only source changes.
COPY services/polaris-functions/deno.json services/polaris-functions/import_map.json ./

# Copy the entry point, env reader, and every function module directory.
COPY services/polaris-functions/main.ts services/polaris-functions/env.ts ./
COPY services/polaris-functions/embed-seed ./embed-seed
COPY services/polaris-functions/eligibility-check ./eligibility-check
COPY services/polaris-functions/notify-updates ./notify-updates
COPY services/polaris-functions/sync-listings ./sync-listings

# Warm the module cache (network deps + type graph) at build time.
RUN deno cache main.ts

EXPOSE 8000

# --allow-read covers the mounted seed JSONL and migrations directory;
# --allow-net covers TEI + PostgREST + Kong; --allow-env covers env.ts.
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
