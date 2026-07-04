# Spec 20 — CI dependency-audit gate with an allowlist to hold the advisory count

**Classification:** Internal (CI/quality infrastructure). It protects the
patient-facing surface indirectly by preventing future silent accrual of
runtime vulnerabilities, but ships no product behavior.

**Persona / job:** No direct persona. It defends the Patient / Advocate "Find a
Relevant Trial" job by keeping the runtime free of undetected high advisories
over time.

## Problem

The npm/bun advisory debt on `products/polaris/site` reached **7 critical/high**
with **zero Dependabot PRs** (issue #16). Two mechanisms were missing:

1. **No detection.** `dependabot.yml` watched `github-actions` only. Spec 20's
   sibling fix (PR #24, Track 1) restores npm-ecosystem detection — but that
   only *raises PRs*; it does not *hold a ceiling*.
2. **No gate.** No CI job fails a build when a critical or high advisory is
   present. A contributor can add or upgrade a dependency that introduces a
   high advisory and merge it green. Nothing keeps the count at zero once the
   Track 2 / Track 3 migrations drive it there.

Without a gate, the count will drift back up the same silent way it did before.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| CI audit job | Runs `bun audit` on every pull request and on push to `main`, and fails the build when a critical or high advisory is present outside the allowlist |
| Allowlist | A checked-in file that records the currently-known advisories (the 7 crit/high plus the moderates/lows the team accepts for now), each with an advisory id and an expiry or tracking reference, so the gate does not red-wall `main` on day one |
| Severity threshold | The gate blocks on `critical` and `high`; `moderate` and `low` are reported but do not fail the build |
| Policy documentation | The `## Security` section of CONTRIBUTING.md gains the audit-gate policy: what fails a build, how to add an allowlist entry, and that an entry needs a linked remediation issue |

**Out of scope:**

- Remediating the current advisories — that is Spec 10 (`next`) and Spec 30
  (`vitest`). This spec makes the debt *visible and bounded*, not gone.
- Changing `dependabot.yml` — Track 1, already shipped in PR #24.
- Secret scanning (`gitleaks` already runs pre-push) and Actions SHA-pinning —
  tracked under separate metrics, not this obstacle.

## Constraints

- **Must ship with the allowlist populated.** Merging the gate with an empty
  allowlist would immediately fail every PR against `main` because the 7
  crit/high advisories are still present until Specs 10 and 30 land. The gate
  and the allowlist are one atomic change.
- **The allowlist shrinks, never silently grows.** Every entry carries a
  tracking reference; adding an entry is a reviewable diff, never an automatic
  suppression.
- Must not weaken any existing gate (`lint`, `typecheck`, `test`, `gitleaks`,
  `coaligned`, smoke).

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A CI job runs `bun audit` on every PR and on push to `main` | `.github/workflows/*` on a test PR |
| 2 | The job fails when an un-allowlisted critical or high advisory is present | a PR introducing a known-high dep goes red |
| 3 | The job passes on today's tree, because the current 7 crit/high are allowlisted | the gate is green on `main` at merge |
| 4 | Each allowlist entry names its advisory id and a tracking reference | the allowlist file |
| 5 | Removing an advisory's allowlist entry after its migration lands turns the gate red until the dep is bumped | manual check after Spec 10 / 30 merge |
| 6 | CONTRIBUTING.md `## Security` documents the gate and the allowlist-entry rule | CONTRIBUTING.md |

## Notes for design

`check-quality.yml` already hosts `lint` and `typecheck` jobs on the same
`pull_request` + push-to-`main` triggers — the natural host for an `audit` job.
Design should choose whether `bun audit`'s own output is machine-parseable
enough to diff against an allowlist, or whether a thin wrapper script is needed;
that HOW belongs in the design/plan, not here. The allowlist format should make
"entry expired / dep migrated" a red state, so the gate actively pulls the count
down rather than passively tolerating it.

— Security Engineer 🔒
