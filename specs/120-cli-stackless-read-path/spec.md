# spec(120): Infra-independent CLI read path

Serves issue #126. Classification: **product-aligned**. It removes a cold-start
failure that blocks every demand-side walkthrough. It is the prerequisite for
the external-consumer interview lane.

## Problem

Every demand-side CLI read command (`search`, `trial`, `condition`,
`eligibility`) dispatches to a handler. The handler reads through
`createDataContext`. Its `db` client and edge-function client share one
`fetchImpl`, which defaults to `globalThis.fetch` against `SUPABASE_URL` (the
local Kong front door). When no live Supabase stack is up, the first such call
rejects with `fetch failed`. Every read walkthrough then dies at cold start
before producing output. No read path works without the full self-hosted stack.

Evidence (by behaviour or entity, not `file:line`):

- `createDataContext` defaults `fetchImpl` to `globalThis.fetch` and the base
  URL to the local stack. A handler's first `db.get` on a down stack rejects
  with `fetch failed`.
- `searchTrials`, `showTrial`, and `showCondition` read only via
  `db.get`/`db.rpc`. `checkEligibility` (the `eligibility` command) additionally
  invokes the `eligibility-check` edge-function scorer and attempts a
  best-effort interest-signal write. None has a stackless fallback.
- The seeded domain already derives from `story.dsl`, so a stackless projection
  has a source of record. Test mode already runs handlers against canned
  fixtures through an injected `fetchImpl` (`seed-trial.json`,
  `seed-condition.json`), so the injection seam already exists.

## Users and jobs

| Persona | Job | Why a stackless read matters |
| --- | --- | --- |
| Patient / Advocate | "Find a Relevant Trial" (`search`, `trial`, `condition`, `eligibility`) | A first-touch consumer who hits `fetch failed` abandons. |
| Referring Physician | "Refer in the Visit" | The visit lasts three minutes. Requiring a full stack is a non-starter. |
| Clinical Development Staff | "Keep Listings True" | Write-side and out of scope. See non-goals. |

## What (scope)

Provide a stackless read mode for the four demand-side read commands (`search`,
`trial`, `condition`, `eligibility`). When active, each command returns its
normally-shaped handler data sourced from a stackless projection of the seeded
domain, the same `story.dsl`-derived world, with no live PostgREST or
edge-function call.

In scope:

- `search`, `trial`, `condition` serve their reads from the stackless
  projection.
- `eligibility` runs the screener against the projection and records no interest
  signal.
- Output parity with the live path: same handler result shape; `--json`
  unchanged.
- A mode-selection mechanism. The design chooses activation. The WHAT is that a
  no-stack invocation of the four commands succeeds.

## Non-goals (read-only projection only)

- No write paths offlined. Interest-signal capture and `admin trial`
  (manage-trial) stay behind the live stack. They require PostgREST POST/PATCH
  and, for manage-trial, a staff token. Stackless `eligibility` records no
  interest signal. It skips the write instead of queuing or offlining it.
- Not a general offline mode. Only the four demand-side read commands are
  projected. No whole-app offline runtime, no cached writes, no sync.
- The stackless scorer evaluation and semantic-search behaviour are the design's
  call. The WHAT requires only that each command completes with no live stack.

## Why

Issue #126 is the missing prerequisite for the Polaris external-consumer
kata-interview lane (obstacle #111). A persona cannot run a demand-side
walkthrough today because cold start dies on `fetch failed`. A stackless read
path lets the interview lane run the `FIT_TERRAIN=<checkout> just boot` → smoke
→ localhost recipe tracked upstream at forwardimpact/kata-skills#2. It also lets
a first-touch patient or physician get a result without standing up Supabase.

## Success criteria

1. With no Supabase stack running, `search --condition=<seeded>` returns trial
   results and exits 0. Verify by running the command with the stack down.
2. With no stack running, `trial <id>`, `condition <id>`, and `eligibility
   <id>` each return their shaped output for seeded ids. Verify by running each
   with the stack down.
3. `--json` output for each of the four commands matches the live-path shape.
   Verify against a committed baseline `--json` snapshot captured once from the
   live path, not a live diff at verify time.
4. With no stack running, a write path (`admin trial <id> --update=...`) still
   errors rather than silently succeeding offline. Verify by running the write
   command with the stack down.
5. In stackless mode the four commands make zero live PostgREST or
   edge-function calls, and `eligibility` records no interest signal. Verify
   with a fetch stub that records every call attempt: assert no attempt reaches
   a live PostgREST or edge-function endpoint, and that `eligibility` attempts
   no `interest_signals` write.

— Technical Writer 📝
