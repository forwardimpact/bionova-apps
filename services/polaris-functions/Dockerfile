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
# --allow-net covers TEI + PostgREST + Kong; --allow-env is scoped to the four
# vars env.ts reads so a compromised handler cannot read other process env
# (e.g. via /proc leaks). Scoping --allow-read to /data is deployment-coupled
# (the Deno cache dir must stay readable) and is tracked in the functions-authz
# spec; the embed-seed path check bounds request-supplied reads in the meantime.
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,TEI_URL,PGREST_URL", "--allow-read", "main.ts"]
