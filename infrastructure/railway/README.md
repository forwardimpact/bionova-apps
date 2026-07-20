# Railway deployment

BioNova Polaris deploys to Railway with **watch-path** services: one Railway
service per `infrastructure/` subdirectory and per product surface. A push that
touches only `products/polaris/site/**` redeploys just `polaris-site`.

## One-time setup

```sh
railway login
railway init --name bionova-apps
railway link
```

`railway init` writes `.railway/project.json` (gitignored). The project name is
`bionova-apps`.

## Per-service config

Each service carries a `railway.toml` declaring its `watchPaths`, builder
(Dockerfile or Nixpacks), and healthcheck path. See:

- `infrastructure/{postgres,kong,pgbouncer,postgrest,gotrue,storage,tei}/railway.toml`
- `products/polaris/site/railway.toml`
- `services/polaris-functions/railway.toml`

The `polaris-site` service watches only `products/polaris/site/**`. Because the
site bundles the shared handlers, `deploy.yml` redeploys it when a push touches
`products/polaris/handlers/**` too.

## Deploy token

The `deploy.yml` workflow detects changed services and runs
`railway up --service=<name>` for each. It installs the Railway CLI from a
pinned npm version (`@railway/cli@3.20.0`) rather than the floating
`curl | sh` installer. Set a project-scoped token from the Railway dashboard as
the `RAILWAY_TOKEN` repo secret.

## Sandbox note

This repository was built as a local sandbox. No live Railway project is linked
here; the configs and workflow are authored and validated, but `railway up` has
not been run. To deploy for real, run the one-time setup above and add the
`RAILWAY_TOKEN` secret.
