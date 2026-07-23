# Spec 220 — CI dependency-compat gate (npm `engines` reconciliation)

> **Sibling to the in-flight Spec 110 lockfile-integrity gate (PR #122, still
> `spec draft` — not yet on `main`).** Same arc-class and owner: a CI gate that
> closes a dependency-hygiene blind spot the bun-based quality gates cannot see.
> 110 watches the lockfile-vs-manifest relationship; this watches the
> dependency-vs-runtime relationship. They are independent detectors — neither
> subsumes the other. This spec stands on its own: it does not depend on 110
> landing, and its invariants are stated here in full, not derived from 110.
> Should both land, they should share a design shape where practical.

**Classification:** Internal (CI / dependency hygiene). It ships no product
behaviour. It hardens the contributor toolchain and the external `npx` consumer
contract by giving CI a signal it does not have today.

**Persona / job:** No direct persona. Polaris is consumed by external users on
Node via `npx` (CLAUDE.md § Tooling), so an installed dependency that cannot run
on the declared/pinned Node runtime breaks those consumers. This gate defends the
contributor-facing toolchain integrity that keeps every persona's surface
buildable and runnable.

## Problem

Every CI quality gate installs and checks under **bun**, and `bun install` does
not evaluate the npm `engines` field. So a dependency bump whose `engines.node`
floor exceeds this repo's pinned Node runtime **installs cleanly and passes every
check green** — CI raises no signal that the dependency is unrunnable for the
pinned runtime or for external npm/npx consumers.

Grounding (all resolve on `main`):

- **Seven bare `bun install` sites, zero engines evaluation.** `check-quality`
  (lint + typecheck jobs), `check-test`, `check-seed`, `check-audit`,
  `check-context`, and `check-e2e` each run `bun install` with no
  engines-vs-runtime check. No workflow anywhere in `.github/workflows/` runs
  `--engine-strict` or reconciles `engines` against the runtime pin.
- **Runtime source of truth.** `.tool-versions` pins `nodejs 22.23.1`;
  `package.json` declares `engines.node ">=22.23.1"`; `deploy.yml` sets
  `node-version: '22'`. These are three separate declarations of "the Node we
  support," kept in agreement only by manual discipline.

**Why this outlives its trigger (#207).** #207 bumped eslint 9.39.4 → 10.7.0;
eslint 10 declares `engines.node: ^20.19.0 || ^22.13.0 || >=24`, above the then
pinned 20.11.1. It was caught only by a human reading the dependency's `engines`,
and closed. #213 then remediated that specific instance — it raised
`.tool-versions nodejs` to 20.19.0 and aligned `engines.node` to `>=20.19.0`, so
that acute mismatch was gone. The runtime has since moved again: #262
(`a925d62`) and #268 (`e9229bd`, 2026-07-22/23) raised all three declarations
20→22 (now `nodejs 22.23.1` / `engines.node ">=22.23.1"` / `node-version: '22'`).
That reconciliation is itself the argument: three files were moved into agreement
**by hand**, in lockstep, with no detector watching — exactly the manual
discipline this gate replaces. Neither #213 nor #262/#268 was a detector; the
systemic gap is unchanged across all three. The **next** engine-floored bump — a
dependency requiring a floor above the pin (`>=24`, or any range the current
`22.23.1` does not satisfy) — still installs and checks green, undetected until a
human happens to read its `engines`. The class is the defect, not the eslint
instance.

This is the same latent-trap class as the in-flight lockfile-integrity gate
(Spec 110, PR #122): a bun-native workflow silently tolerating a condition an
explicit check would catch. It is hygiene/currency work — no advisory drives it,
and it carries no security urgency.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Compat detector | A CI check that evaluates every installed workspace dependency's declared `engines.node` and fails when a dependency's range is not satisfiable by the Node version the repo pins |
| Runtime reconciliation | Establishes one unambiguous "pinned runtime" for the check by reconciling `.tool-versions` `nodejs` with `package.json` `engines.node`; the check fails when they disagree, so the floor the detector compares against cannot silently drift |
| Pre-merge trigger | Runs on `pull_request` (and `push` to `main`) so an engine-floored bump is caught before it reaches `main`, not after |

**Out of scope:**

- **Runtime-pin remediation.** Bumping `.tool-versions` / `engines.node` /
  `deploy.yml node-version` when a finding routes to it is staff build-tooling,
  not this detector. This spec delivers the signal, not the pin bumps it triggers.
- **The Deno edge functions.** Deno dependencies have no npm `engines` model;
  their currency is Spec 20 / Spec 40. This gate covers the npm/bun workspace only.
- **Global CLI tool installs** — e.g. the Railway CLI installed via `npm install
  -g` in `deploy.yml` is not a workspace dependency.
- **`deploy.yml`'s `node-version: '22'`** — a coarser CI-runner pin, intentionally
  not part of the SC2 reconciliation. The workspace floor of record is
  `.tool-versions` `nodejs` plus `package.json` `engines.node`; the deploy runner
  pin is a separate, looser declaration this gate does not reconcile. It is kept
  in sync manually — #262/#268 moved it '20'→'22' in the same lockstep as the
  reconciled pair — but it sits intentionally outside the detector's
  reconciliation set.
- **The lockfile-integrity gate (Spec 110).** Sibling detector; not re-authored
  here.
- **The eslint 9 → 10 migration (issue #120 — not to be confused with the
  unrelated `specs/120-cli-stackless-read-path`).** That is a separate,
  source-rule migration; this gate would have surfaced its runtime constraint,
  but does not perform it.

## Constraints

- **Fail-closed, no false green.** A passing result must mean the `engines` were
  actually evaluated against the pinned runtime — never that the evaluation was
  skipped because a tool was absent, no dependencies were found, or a bare
  install self-healed. This mirrors the Spec 110 invariant: the detector is an
  explicit check, not a bare install whose success masks the condition.
- **No toolchain swap.** bun stays the primary install/check toolchain; the
  engines evaluation is an added step, not a migration off bun.
- **Weaken no existing gate**, including the #26 npm audit gate, the Spec 20 Deno
  pin check, and the Spec 110 lockfile check.
- **No over-claimed severity.** This is dependency currency/hygiene; the gate
  fails builds on an unrunnable-dep condition, but the finding class is not a
  security advisory.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A CI check fails when an installed workspace dependency declares an `engines.node` range not satisfiable by the Node version pinned in `.tool-versions` | a throwaway PR adding or pinning a dependency whose `engines.node` floor exceeds the pin turns the check red |
| 2 | The check fails when `package.json` `engines.node` and `.tool-versions` `nodejs` disagree, so the runtime the detector compares against stays reconciled | a throwaway PR editing one without the other turns the check red |
| 3 | The check runs on `pull_request` and on `push` to `main` | the check's trigger config in `.github/workflows/` |
| 4 | A green result means the `engines` were evaluated; the check cannot pass by silently skipping (absent tool, zero dependencies resolved, or a bare install standing in for the evaluation all fail closed) | a throwaway change that disables the evaluation turns the check red, not green |
| 5 | Scope is the npm/bun workspace only — the Deno edge functions and global CLI installs are excluded | the check configuration and this spec's scope |
| 6 | No pre-existing gate changes behaviour — `check-quality`, `check-audit`, and the other bun checks stay green on an in-range `main` | CI on `main` after the gate lands |
| 7 | The SC1, SC2, and SC4 fail cases stay verifiable on `main` after the demonstrating PRs close — the gate carries a committed regression check that CI exercises, as the Spec 20 audit gate does with `audit-gate.test.js` | the committed regression check runs in CI on `main` |

— Security Engineer 🔒
