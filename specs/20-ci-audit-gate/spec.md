# Spec 20 — Deno version-pin advisory check + audit-gate policy doc (the other half of `ci_security_gates_missing`)

> **Rescoped 2026-07-04 (facilitator, took option b).** The npm-side audit gate
> is already implemented by PR #26 (experiment #22) and is **not superseded** —
> this spec no longer authors an npm gate. It covers the two non-duplicative
> gaps #26 leaves: the **Deno dependencies** and the **CONTRIBUTING policy
> documentation**.
>
> **Rescoped again 2026-07-04 (mechanism fork, took option b).** The prior draft
> promised an OSV-Scanner gate over the resolved Deno *graph*. Verified against
> the four edge functions, that mechanism resolves to **zero auditable
> packages** and would go falsely green on the one dependency we care about (see
> Problem gap 1). This spec now scopes the honest, achievable coverage today — a
> **version-pin advisory check** on the top-level pins — explicitly a **stopgap,
> not a graph scanner**. The durable graph gate depends on a source migration
> and is filed as a separate structural spec (Out of scope).

**Classification:** Internal (CI/quality infrastructure). It protects the
patient-facing edge functions indirectly by checking their pinned dependencies;
it ships no product behavior.

**Persona / job:** No direct persona. It defends the Patient / Advocate and
Clinical Development Staff jobs by keeping the Supabase edge functions — which
carry patient-facing infra logic — free of undetected advisories on their
pinned dependencies.

## Problem

PR #26 adds a `bun audit` gate that fails CI on new critical/high advisories in
the **npm/bun** graph. That closes one of the two gaps in
`ci_security_gates_missing` (baseline 2). The second gap remains open, and the
mechanism to close it is narrower than the prior draft assumed:

1. **The Deno dependencies are unmonitored, and a graph scanner cannot see
   them.** `services/polaris-functions` runs on Deno, not npm. `bun audit`
   cannot see any of it — that much is real. But an OSV-Scanner gate over
   `deno.lock` cannot see them either, for three verified structural reasons:
   - `import_map.json` imports `@supabase/supabase-js@2.110.0` as an
     `https://esm.sh/…` URL, **not** an `npm:` specifier. esm.sh and `std` URLs
     carry no landed PURL, so OSV has nothing to key an advisory lookup on.
   - `deno.lock` (v5) carries **only** `deno.land/std@0.224.0` hashes.
     supabase-js and its whole transitive tree are **absent** from the lockfile.
     Worse, `@supabase/supabase-js` is currently a *declared-but-unimported*
     specifier — no module imports it, so it is not in the resolved graph at
     all; the only external import that reaches the lock is `std`, and only from
     the `test.ts` files.
   - OSV-Scanner ships **no `deno.lock` extractor**. Pointed at this tree it
     resolves to zero packages and reports clean — a **false green** on exactly
     the dependency the gate exists to watch.

   A false-green gate is worse than no gate: it manufactures confidence and
   stops people looking. The honest, buildable coverage today is a check on the
   **top-level pinned versions** (`std@0.224.0`, `supabase-js@2.110.0`) against
   an advisory source, keyed by ecosystem and version rather than by lockfile
   PURL. That does not cover the transitive tree — closing that gap requires a
   source migration (Out of scope).
2. **The audit-gate policy is undocumented.** #26 ships the npm gate mechanism
   but adds nothing to CONTRIBUTING. A contributor who hits a red gate, or who
   needs to accept a finding, has no written policy: what fails a build, the
   crit/high threshold, and that adding a baseline acceptance requires a dated
   reason under security-engineer review.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Deno version-pin advisory check | On every PR and on push to `main`, extracts the top-level pinned dependency versions from `import_map.json` and `deno.lock` (`std@0.224.0`, `supabase-js@2.110.0`) and checks each against a known-advisory source keyed by ecosystem + version. Fails the build on an un-accepted critical or high, consistent with #26's fail-on-new-beyond-baseline model. It is a stopgap on the pins, **not** a resolved-graph or transitive-tree scan |
| Deno baseline | The Deno equivalent of `security/audit-baseline.json` — accepted findings keyed by advisory id with a dated reason — so the check does not fail every existing PR on introduction |
| Coverage-boundary note | The check and CONTRIBUTING state plainly that it covers only the top-level pins, not the transitive tree, and reference the follow-on migration spec that lifts it to full graph coverage |
| Policy documentation | The `## Security` section of CONTRIBUTING.md documents the whole audit-gate regime (npm via #26 **and** Deno): the critical/high threshold, that moderate/low are report-only, the baseline-acceptance rule (dated reason, security-engineer review, never silent), and stale-entry removal on remediation |

**Out of scope:**

- **Transitive-tree / resolved-graph scanning of the Deno dependencies.** This
  requires migrating the four edge functions from `esm.sh` URL specifiers to
  `npm:` specifiers so the resolved `deno.lock` carries an auditable npm tree an
  OSV extractor can read — a source change with runtime-resolution implications
  (esm.sh pre-bundled ESM vs Deno's `npm:` compat layer). That is a structural
  change and gets its **own** spec, filed separately by security-engineer; it is
  not folded in here as a footnote or prerequisite.
- The **npm/bun audit gate** — owned by PR #26 (experiment #22). This spec does
  not re-author, replace, or supersede it.
- Remediating current advisories — Spec 10 (`next`) and Spec 30 (`vitest`).
- `dependabot.yml` npm detection — Track 1, shipped in PR #24.
- Actions SHA-pinning and secret scanning — separate metrics.

## Constraints

- **No false-green coverage.** The check must not report clean for dependencies
  it cannot actually see. Its coverage boundary (top-level pins only) is stated
  in the check output and in CONTRIBUTING, so a green result is never read as
  transitive-tree assurance.
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
| 1 | A Deno version-pin advisory check runs on every PR and on push to `main` | a named check appears and runs on a test PR's checks tab |
| 2 | The check fails when an un-accepted critical or high advisory affects one of the top-level pinned versions | a throwaway PR pinning a Deno dependency to a version with a known crit/high advisory turns the check red |
| 3 | The check's output and CONTRIBUTING state that coverage is the top-level pins only, not the transitive tree, and reference the follow-on migration spec | the check log and CONTRIBUTING.md |
| 4 | The check is green on the tree as it stands, and the introducing PR is itself green — gate and any needed baseline land together | the introducing PR merges without red-walling `main` |
| 5 | CONTRIBUTING.md `## Security` documents the crit/high threshold, the baseline-acceptance rule, and stale-entry removal, for both the npm and Deno gates | CONTRIBUTING.md |
| 6 | `ci_security_gates_missing` is recorded once this and #26 are both on `main`, with a note that the Deno side is stopgap pins-only coverage pending the migration spec | `wiki/metrics/kata-security-audit/2026.csv` |

## Notes for design

`check-edge.yml` already runs `deno check` / `deno test` / `deno lint` on the
right triggers — the natural host for the Deno audit step. The mechanism is a
**version-pin advisory lookup**, not a lockfile-graph scan: extract the pinned
versions and query an advisory source (for example, the OSV API by
ecosystem + version, or GitHub advisories) that does not require a landed PURL
or a lockfile extractor. Confirm the source returns a machine-checkable verdict
for the `std` and esm.sh-pinned `supabase-js` versions before committing. Do
**not** reach for an OSV-Scanner-over-`deno.lock` gate — it resolves to zero
packages on this tree (Problem gap 1). The durable graph gate is the follow-on
migration spec; design that separately when it is filed.

— Security Engineer 🔒
