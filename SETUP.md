# Operator setup

The `monorepo-setup` skill scaffolds this repository, but it cannot perform the
steps that need credentials or GitHub admin rights. Those steps are recorded
here. Do them once, after the scaffold lands, to make the Kata agent workflows
and the deploy workflow run.

Every step needs admin on `forwardimpact/bionova-apps`.

## 1. Create the Kata GitHub App

The agent workflows (`agent-dispatch`, `agent-shift`, `agent-storyboard`,
`agent-coaching`, `agent-docs-review`) mint a short-lived token from a GitHub
App with `actions/create-github-app-token`. The `monitor-spec-design` scheduled
workflow mints the same token to record a metrics point. The `kata-interview`
workflow, dispatched manually to test a product against a job, mints the same
token. The `wiki` action uses the same App to push agent memory. Create one App
for this repository.

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App** on the
   account or organization that owns the repo.
2. Name it (for example `bionova-kata`). A homepage URL is required but unused;
   the repository URL is fine.
3. Disable Webhook (uncheck **Active**). The workflows poll; no webhook is
   needed.
4. Set repository permissions:
   - **Contents**: Read and write — commit code and push the wiki.
   - **Issues**: Read and write — read tasks, comment, label.
   - **Pull requests**: Read and write — open and update pull requests.
   - **Metadata**: Read-only (mandatory).
5. Create the App, then **Install App** and scope the installation to
   `bionova-apps` only.
6. Note the **App ID**. Under **Private keys**, generate a key and download the
   `.pem`.

## 2. Configure repository secrets

Add these under **Settings → Secrets and variables → Actions → Secrets**.

| Secret | Value | Used by |
| --- | --- | --- |
| `KATA_APP_ID` | The App ID from step 1. | all `agent-*` workflows, `monitor-spec-design`, `kata-interview`, `wiki` |
| `KATA_APP_PRIVATE_KEY` | The full contents of the downloaded `.pem`, including the header and footer lines. | all `agent-*` workflows, `monitor-spec-design`, `kata-interview`, `wiki` |
| `ANTHROPIC_API_KEY` | An Anthropic API key with model access. | all `agent-*` workflows, `kata-interview` |
| `RAILWAY_TOKEN` | A Railway project token for the deploy target. | `deploy` |
| `SUPABASE_JWT_SECRET` | The stack's JWT signing secret. Must match `JWT_SECRET` in the deployed `.env`. | `kata-interview` (staff mode) |
| `SUPABASE_SERVICE_ROLE_KEY` | The stack's service-role key. Must match `SERVICE_ROLE_KEY` in the deployed `.env`. | `kata-interview` (staff mode) |

The last two secrets are read only by a staff-mode `kata-interview` run, which
provisions a persona identity in the stack. Patient-mode interviews and every
other workflow leave them unused. Set them only if you run staff interviews, and
give each the value the deployed stack uses.

## 3. Configure the killswitch variable

Add this under **Settings → Secrets and variables → Actions → Variables**.

| Variable | Value | Effect |
| --- | --- | --- |
| `KATA_KILLSWITCH` | `on` | Every kata agent run stops at its first step. |

Leave the killswitch **engaged** (`on`) until the App and secrets are verified.
Set it to `off` (or delete it) to let the agents run. The accepted "off" values
are empty, `0`, `false`, `no`, and `off`; any other value engages it.

## 4. Enable the wiki

The agent team's memory lives in the repository wiki. Enable it under
**Settings → General → Features → Wikis**, then let a session or a workflow run
`gemba-wiki init` to scaffold the ledgers. The `Stop` hook in
`.claude/settings.json` and the `wiki` step in `agent-dispatch` push memory back
after each run.

## 5. Pin the FIT toolchain release

`.claude/settings.json` bootstraps a Claude Code session by curling a pinned
`fit-install.sh` release asset from `forwardimpact/monorepo`. Keep it pinned to
a concrete `gear@vX.Y.Z` tag. Resolve the newest at setup and write it into the
`SessionStart` hook:

```sh
gh release list -R forwardimpact/monorepo --json tagName \
  -q '[.[].tagName|select(startswith("gear@v"))][0]'
```

The released `fit-install.sh` self-stamps its own gear release, so that one tag
fixes the whole toolchain.

## Verify

- Run the **Agent: Coaching** workflow from the Actions tab with the killswitch
  engaged. It should stop cleanly at the killswitch step.
- Set the killswitch to `off` and run it again. It should mint a token, install
  the toolchain, and complete.
- Confirm a wiki push landed under the repository **Wiki** tab.
