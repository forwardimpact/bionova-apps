# Spec 200: Infra-independent CLI read mode

**Classification:** Product-aligned. It restores the Patient / Advocate
demand-side read path on the CLI surface, a persona-facing job, not internal
tooling.

**Issue:** [#126](https://github.com/forwardimpact/bionova-apps/issues/126).
**Persona / job:** Patient / Advocate, *Find a Relevant Trial*. This is the
motivating job. Every Polaris demand-side read runs through one backend, so the
same fix benefits the Referring Physician, *Refer in the Visit*, and every other
read persona transitively. Their own in-visit forces are not what scopes this
spec.

## Problem

A first-time demand-side user handed the `bionova-polaris` CLI with no
infrastructure running gets no value from any data-backed command. Every read
command binds to the live self-hosted Supabase stack (Kong and PostgREST on
`localhost:8000`, plus TEI for search). There is no offline, seed-backed, or
fixture-backed read mode.

The seam for a stackless read already exists but is not reachable from the CLI.
Handler unit tests build a data context that runs against canned fixtures with
no stack. The CLI entry builds its data context with no such option, so every
read falls back to a live fetch against the Supabase stack. No CLI flag or env
var exposes the stackless path. The concrete seam and injection point are in
Notes for design.

Evidence, observed on `e19354c` (main) with the stack down:

| Command | Result |
| --- | --- |
| `search --condition="high blood sugar"` | stderr `bionova-polaris: error: fetch failed`, exit 1 |
| `search --condition=diabetes` | same, exit 1 |
| `search --condition=diabetes --json` | same, exit 1 |
| `--help` | exit 0 (the CLI loads; only data-backed commands die) |

## Why it matters

The persona's Big Hire is a plain-language shortlist. The Little Hire is
gauging eligibility before calling a coordinator. Both are unreachable when the
demand path sits entirely behind infrastructure a patient will never stand up.
So the persona gives up and waits. The push that drove them to Polaris, that the
public registry is written for researchers, goes unrelieved.

This read path is also the missing prerequisite for the Polaris
external-consumer `kata-interview` lane (obstacle
[#111](https://github.com/forwardimpact/bionova-apps/issues/111)). An
infra-independent interview cannot exercise the demand journey while every read
command dies on cold start. The stackless recipe tracked upstream at
[forwardimpact/kata-skills#2](https://github.com/forwardimpact/kata-skills/issues/2)
depends on this mode existing.

## What changes

Add a read-only mode to the CLI that serves the demand-side read commands from
the vendored synthetic seed instead of a live PostgREST fetch. The mode is
reachable from the public CLI surface through a documented flag or env var, not
only from unit tests. When the mode is active, these read commands, and the
interactive `repl` that drives them, return real synthetic results derived from
`data/synthetic/`, with zero infrastructure.

The mode is a new read-only projection over the same synthetic source the live
seed is built from. It answers the same read contract the handlers already call
(`db.get` and the search path), so no handler logic changes to consume it.

### In scope

The seven demand-side read commands, which all fail today without the stack:

| Command | Handler |
| --- | --- |
| `search` | `searchTrials` |
| `trial` | `showTrial` |
| `condition` | `showCondition` |
| `eligibility` | `checkEligibility` |
| `sites` | `listSites` |
| `stories` | `listStories` |
| `about` | `showAbout` |

The interactive `repl` command is an eighth demand-side read surface. It drives
`searchTrials`, `showTrial`, `showCondition`, `listSites`, and `listStories`
through the same shared data context, so it fails offline today for the same
reason and inherits read mode from the same injection point. Read mode covers
it; SC1 verifies it.

### Out of scope

- Write and staff paths. `admin trial` (`manageTrial`) stays behind the live
  stack. Read mode never serves a staff mutation. One read command carries a
  write side effect: `eligibility` records an anonymous interest signal after it
  answers (`checkEligibility` posts to `interest_signals`). That write is
  best-effort in the handler already. In read mode it does not persist and is not
  treated as a failure, so the eligibility answer still returns. SC5 covers this
  boundary.
- A general offline mode for the whole product. This spec covers the CLI
  demand-side read commands only, not the site or the edge functions.
- Error-message legibility for the live-stack failure. The opaque
  `error: fetch failed` surface (no cause, URL, or remediation) is a real but
  distinct gap the issue flags for a separate spec. It is not folded here, so
  read mode does not become a workaround that hides the connectivity defect.

## Success criteria

| # | Criterion | Verify |
| --- | --- | --- |
| SC1 | With read mode active and no stack running, each of the seven read commands, and a read driven inside the interactive `repl`, exits 0 and prints results. | Stop the stack, run each command with the read-mode flag or env var set; assert exit 0 and non-empty output; run one `search` and one `trial` read inside `repl` and assert the same. |
| SC2 | The results are the real synthetic domain, not stubs or empty sets. | `search --condition=diabetes` returns at least one trial whose fields match a `story.dsl`-derived row; `trial <id>` on that id resolves; `condition`, `sites`, `stories`, `about` each return seeded content. |
| SC3 | `search` resolves a condition with no embeddings service present. | With read mode active and no TEI reachable, `search --condition=diabetes` returns diabetes-relevant trials by the mode's own matching, and does not error on the absent embeddings service. |
| SC4 | `eligibility <id>` returns a verdict offline that agrees with the `eligibility-check` scorer. | With read mode active, `eligibility <id> --age=… --conditions=… --ecog=…` returns a verdict for a seeded trial; on at least one seeded eligible case and one seeded ineligible case the offline verdict matches what the edge function's pure `score()` function returns for the same inputs (that function is deterministic and can be exercised in isolation, so the check needs no running stack). |
| SC5 | The read-only boundary holds, including the `eligibility` write side effect. | With read mode active: `admin trial <id> --update='…'` does not mutate through the read path and fails closed with a message that names the boundary; and `eligibility <id> …` returns its answer while the interest-signal insert is not persisted. |
| SC6 | Default behavior is unchanged. | With no read-mode flag and no read-mode env var, behavior is identical to today; existing tests and `just smoke` pass unchanged. |
| SC7 | The mode is discoverable from the public CLI. | The read-mode flag or env var name appears in `bionova-polaris --help` output. |

## Notes for design

These carry forward from the issue and the staff-engineer design-input on #126.
They are context for the design, not part of the WHAT.

- Shape. A fixture or seed-backed data context that satisfies the same read
  contract the handlers call, injected at the CLI entry where `createDataContext`
  is built, in place of the live `fetchImpl`. The stackless seam
  (`opts.fetchImpl` / `opts.stub`) is the injection point that already exists.
- Source of truth. The synthetic seed under `data/synthetic/` (`story.dsl` plus
  `prose-cache.json`) is the one source. The read fixture is a projection of it,
  not a second hand-authored dataset. How the fixture is produced and kept in
  step with the seed is a design and plan concern.
- `eligibility` screening. The screener today dispatches to the
  `eligibility-check` edge function, whose pure `score()` function lives in Deno
  and which the handler cannot import. So an offline verdict has to reproduce
  that scorer, not just read the criteria. It also has to serve the `criteria`
  and `conditions` reads the handler makes around the score call. SC4 raises the
  bar to verdict parity with `score()` for a seeded eligible and ineligible case.
  How that parity is reached, by running equivalent logic in-process or by
  another mechanism, is a design decision. The same handler also posts an
  anonymous interest signal after it answers; in read mode that write must no-op
  without failing the answer (SC5).
- Interview dependency. When this mode lands, revisit obstacle #111 and
  kata-skills#2 to open the external-consumer interview lane on the demand path.
