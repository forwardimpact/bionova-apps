# Spec 20 — Deno-graph audit gate + audit-gate policy doc (the other half of `ci_security_gates_missing`)

> **Rescoped 2026-07-04 (facilitator decision, took option b).** The npm-side
> audit gate is already implemented by PR #26 (experiment #22) and is **not
> superseded** — this spec no longer authors an npm gate. It now covers only the
> two non-duplicative gaps #26 leaves: the **Deno dependency graph** and the
> **CONTRIBUTING policy documentation**. Together with #26, this closes
> `ci_security_gates_missing` 2 → 0.

**Classification:** Internal (CI/quality infrastructure). It protects the
patient-facing edge functions indirectly by monitoring their dependency graph;
it ships no product behavior.

**Persona / job:** No direct persona. It defends the Patient / Advocate and
Clinical Development Staff jobs by keeping the Supabase edge functions — which
carry patient-facing infra logic — free of undetected dependency advisories.

## Problem

PR #26 adds a `bun audit` gate that fails CI on new critical/high advisories in
the **npm/bun** graph. That closes one of the two gaps in
`ci_security_gates_missing` (baseline 2). The second gap remains open:

1. **The Deno dependency graph is unmonitored.** `services/polaris-functions`
   runs on Deno, not npm. Its four edge functions (`notify-updates`,
   `embed-seed`, `sync-listings`, `eligibility-check`) import external
   dependencies over URLs — `@supabase/supabase-js@2.110.0` (a substantial
   package with its own transitive tree) and `deno.land/std@0.224.0` — pinned in
   `deno.lock` and `import_map.json`. `bun audit` cannot see any of it. A
   critical advisory against `supabase-js` or `std` would reach `main`
   completely undetected. These functions are patient-facing infrastructure, so
   the blind spot is a real gap, not a formality.
2. **The audit-gate policy is undocumented.** #26 ships the npm gate mechanism
   but adds nothing to CONTRIBUTING. A contributor who hits a red gate, or who
   needs to accept a finding, has no written policy: what fails a build, the
   crit/high threshold, and that adding a baseline acceptance requires a dated
   reason under security-engineer review.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Deno-graph audit check | Audits the resolved Deno dependency graph of `services/polaris-functions` for known advisories on every PR and on push to `main`, and fails the build on an un-accepted critical or high, consistent with #26's fail-on-new-beyond-baseline model |
| Deno baseline | The Deno equivalent of `security/audit-baseline.json` — accepted findings keyed by advisory id with a dated reason — so the check does not fail every existing PR on introduction |
| Policy documentation | The `## Security` section of CONTRIBUTING.md documents the whole audit-gate regime (npm via #26 **and** Deno): the critical/high threshold, that moderate/low are report-only, the baseline-acceptance rule (dated reason, security-engineer review, never silent), and stale-entry removal on remediation |

**Out of scope:**

- The **npm/bun audit gate** — owned by PR #26 (experiment #22). This spec does
  not re-author, replace, or supersede it.
- Remediating current advisories — Spec 10 (`next`) and Spec 30 (`vitest`).
- `dependabot.yml` npm detection — Track 1, shipped in PR #24.
- Actions SHA-pinning and secret scanning — separate metrics.

## Constraints

- **Do not duplicate #26.** Reuse #26's baseline model, threshold, and
  fail-open-on-infrastructure-error posture so the two gates behave identically;
  a contributor should not have to learn two policies.
- **The baseline shrinks, never silently grows.** Every Deno acceptance carries
  a dated reason and a tracking reference; adding one is a reviewable diff in a
  PR, bounded by human review, never an automatic suppression.
- Must not weaken any existing gate (`check-edge`, `lint`, `typecheck`, `test`,
  `gitleaks`, `coaligned`, smoke, and #26's npm audit gate).

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A Deno dependency-audit check runs on every PR and on push to `main` | a named check appears and runs on a test PR's checks tab |
| 2 | The check fails when an un-accepted critical or high advisory is present in the Deno graph | a throwaway PR pinning a known-vulnerable Deno dependency turns the check red |
| 3 | The check is green on the tree as it stands | the introducing PR's own CI run is green |
| 4 | The PR that introduces the Deno gate is itself green — gate and any needed baseline land together | the introducing PR merges without red-walling `main` |
| 5 | CONTRIBUTING.md `## Security` documents the crit/high threshold, the baseline-acceptance rule, and stale-entry removal, for both the npm and Deno gates | CONTRIBUTING.md |
| 6 | `ci_security_gates_missing` is recorded at 0 once this and #26 are both on `main` | `wiki/metrics/kata-security-audit/2026.csv` |

## Notes for design

`check-edge.yml` already runs `deno check` / `deno test` / `deno lint` on the
right triggers — the natural host for the Deno audit step. **The main design
risk is mechanism feasibility:** Deno has no built-in `deno audit` equivalent to
`bun audit`. The design must determine how to map the resolved `deno.lock` /
`import_map.json` graph to a known-advisory source (for example, an OSV-based
scan of the resolved dependencies) and confirm it produces a machine-checkable
verdict before committing to the gate. If no reliable mechanism exists yet, the
design should say so and propose the closest achievable coverage rather than
promise a gate that cannot be built.

— Security Engineer 🔒
