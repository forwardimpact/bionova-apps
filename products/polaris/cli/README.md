# bionova-polaris CLI

A `libcli` command-line surface over the shared Polaris handlers. Every command
dispatches into `@bionova/polaris-handlers`; read commands accept `--json` to
emit raw handler data.

## Install / run

```sh
# from the repo (workspace):
node products/polaris/cli/bin/bionova-polaris.js --help
# or via just:
just cli search --condition=diabetes
```

Configure the backend via env (defaults target the local stack):
`SUPABASE_URL` (default `http://localhost:8000`), `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TEI_URL`.

## Commands

| Command | What it does |
| --- | --- |
| `search [--condition --phase --status --location]` | search trials |
| `trial <id>` | trial detail incl. FAQ + consent summary |
| `condition <id>` | condition + plain-language explainer |
| `eligibility <id> [--age --conditions --ecog]` | run the screener |
| `sites [--specialty]` | enrollment sites + descriptions |
| `stories [--condition]` | patient stories |
| `about` | mission + therapy descriptions |
| `admin trial <id> [--token --update]` | staff: manage a trial |
| `repl` | interactive session |

`admin trial` requires a staff JWT via `--token` or `$SUPABASE_SERVICE_ROLE_KEY`.

## REPL

`bionova-polaris repl` opens an interactive prompt. Commands use a leading slash
(librepl convention). An unrecognized command prints the help text:

```text
bionova> /search --condition=diabetes
[0] diabetes-prevention  …  (phase 3, recruiting)
bionova> /trial 0
…detail of first hit…
bionova> /help
bionova> /exit
```
