# Spec 40 — Deno resolved-graph audit coverage (esm.sh → `npm:` migration)

> **Follow-on to Spec 20 (PR #30).** Spec 20 ships an honest **stopgap**: a
> Deno version-pin advisory check on the two top-level pins
> (`std@0.224.0`, `supabase-js@2.110.0`). It explicitly does **not** cover the
> transitive tree, because the tree is not auditable on the source as it stands
> today (see Problem). This spec is the durable home for that deferred scope:
> the source migration that makes the Deno dependency graph auditable, and the
> lift of the Deno gate from pin-only to full resolved-graph coverage.
> Spec 20 records `ci_security_gates_missing` at `0` — a gate now runs on both
> dependency surfaces — but with a disclosed note that the Deno side is
> pins-only, the transitive tree tracked here (Spec 20 SC6). This spec does
> **not** move the count; its value is retiring that disclosed boundary by
> delivering genuine transitive coverage, so a green Deno gate can be read as
> graph assurance without a caveat.

**Classification:** Internal (CI/quality infrastructure). It hardens the
patient-facing Supabase edge functions by making their full dependency graph
auditable; it ships no product behaviour.

**Persona / job:** No direct persona. It defends the Clinical Development Staff
job "Keep Listings True" (JTBD.md:35) — the edge functions
(`notify-updates`, `sync-listings`, `embed-seed`, `eligibility-check`) carry the
infrastructure that keeps public listings matching the protocol — by removing a
blind spot where a critical advisory in the `supabase-js` transitive tree could
reach `main` undetected.

## Problem

Spec 20's stopgap watches the top-level pinned versions but is structurally
blind to everything beneath them. Three verified facts make the transitive tree
un-auditable on the source today:

1. **`supabase-js` is imported as an `esm.sh` URL, not an `npm:` specifier.**
   `services/polaris-functions/import_map.json` maps
   `@supabase/supabase-js` to `https://esm.sh/@supabase/supabase-js@2.110.0`.
   An esm.sh URL carries no landed PURL and pins no lockfile tree, so an
   OSV-based extractor has nothing to key an advisory lookup on.
2. **`deno.lock` (v5) carries only `deno.land/std@0.224.0`.** `supabase-js` and
   its whole transitive tree are absent from the lockfile. It is presently a
   *declared-but-unimported* specifier — no function module imports it — so it
   does not reach the resolved graph at all; only `std`, from the `test.ts`
   files, is locked.
3. **No `deno.lock` OSV extractor exists.** Pointed at this tree, OSV-Scanner
   resolves to zero packages and reports clean — a false green on exactly the
   dependency the gate exists to watch.

The consequence: full resolved-graph coverage is not a config change on the
existing gate. It requires a source migration with runtime-resolution
implications, which is why Spec 20 deferred it here rather than folding it in as
a footnote.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Source migration | Move the edge functions from `esm.sh` URL specifiers to `npm:` specifiers so Deno resolves an auditable npm tree into `deno.lock` |
| Lockfile-graph audit | Lift the Deno gate from top-level-pin coverage (Spec 20) to a scan of the resolved `deno.lock` npm tree — the transitive dependencies, not just the declared pins |
| Runtime-parity verification | Confirm the migrated functions behave identically at runtime (esm.sh pre-bundled ESM vs Deno's `npm:` compat layer) — the four functions and their tests stay green |
| Coverage-boundary retirement | Remove Spec 20's "top-level pins only" caveat from the check output and CONTRIBUTING once graph coverage is real |

**Out of scope:**

- The Spec 20 stopgap itself — this spec supersedes its coverage boundary, it
  does not re-author the check.
- The npm/bun audit gate (PR #26) and current-advisory remediation
  (Spec 10 `next`, Spec 30 `vitest`).

## Constraints

- **No false-green coverage.** The lifted gate must actually see the transitive
  tree before Spec 20's caveat is retired; a green result must not be read as
  graph assurance until the migration is verified to produce an auditable lock.
- **No runtime regression.** The migration must not change edge-function
  behaviour; the `esm.sh` → `npm:` switch is verified against existing tests and
  smoke before the coverage claim changes.
- Must not weaken any existing gate, including Spec 20's pin check and #26's npm
  gate.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The edge functions import their external dependencies via `npm:` specifiers and `deno.lock` carries the resolved npm tree | `import_map.json` / `deno.json` and `deno.lock` |
| 2 | The Deno audit check scans the resolved transitive tree and fails on an un-accepted critical or high anywhere in it | a throwaway PR pinning a transitively-vulnerable dependency turns the check red |
| 3 | The migrated functions pass their existing tests and smoke unchanged | `check-edge` CI and `scripts/smoke.sh` |
| 4 | Spec 20's "top-level pins only" coverage caveat is removed from the check output and CONTRIBUTING | check log and CONTRIBUTING.md |
| 5 | The `ci_security_gates_missing` note no longer carries the "Deno side pins-only" caveat once this is on `main` — the count stays `0`, the disclosed boundary retires | `wiki/metrics/kata-security-audit/2026.csv` |

## Notes for design

This is a **stub**: the WHAT/WHY is settled, the mechanism is not. The design
must resolve whether `npm:` specifiers under Deno's compat layer preserve the
edge functions' runtime behaviour (esm.sh ships pre-bundled ESM; the `npm:`
path resolves through Deno's Node-compat shims), and whether the resolved
`deno.lock` npm tree is readable by an OSV extractor. If the migration proves
infeasible without a functional regression, the design should say so and
propose the closest achievable graph coverage rather than force a migration
that breaks the functions.

— Security Engineer 🔒
