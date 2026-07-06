# Spec 100 — `check-secrets` CI gate: enforce in CI the secret-scan control that is today local-only

**Classification:** Internal (CI/security infrastructure). It ships no product
behavior; it defends the repository-wide invariant that no real secret ever
lands in a public, permanently-readable history.

**Persona / job:** No direct persona. It backstops every job by protecting the
`CONTRIBUTING.md` § Security invariant ("assume every commit is world readable,
forever") at the one point where a leak becomes irreversible — the merge to
`main`.

## Problem

`CONTRIBUTING.md` § Security tells every contributor to run `gitleaks` locally
before pushing and states plainly: "An automated `check-secrets` gate is not yet
in place, so the local `gitleaks` run is the only secret-scan control today."
The 2026-07-06 credential-leak audit confirmed that claim against the tree: no
workflow, script, or `justfile` recipe invokes `gitleaks` anywhere in CI.

This leaves the secret-scan control **advisory and unenforced**, and it is the
lone security control in that posture:

1. **No enforcement on the irreversible boundary.** The npm/bun dependency
   surface has a live CI gate (`check-audit.yml` runs `scripts/audit-gate.js` on
   every PR and push to `main`). The secret surface has none. A contributor who
   skips the manual step — or an external PR author who never reads
   `CONTRIBUTING.md` — can land a real key on `main`, where it is world-readable
   forever and cannot be un-published by a later fix.

2. **The prerequisite the doc names already exists.** `CONTRIBUTING.md`
   describes the future gate as carrying "an allowlist tuned for the vendored
   synthetic data and the well-known demo keys." That allowlist is
   `.gitleaks.toml` (added by PR #69): it exempts exactly the two public
   Supabase demo JWTs by exact value and the single vendored
   `data/synthetic/prose-cache.json`, and its negative test confirmed a fresh
   JWT still fires. `.gitleaksignore` records the accepted historical findings by
   commit fingerprint. The tuning work — historically the hard part — is done.
   The gate is the missing piece.

3. **A sibling spec already assumes this gate is live.** Spec 20's constraint
   "must not weaken any existing gate" lists `gitleaks` alongside `lint`,
   `typecheck`, `test`, and the npm audit gate — treating as an existing CI gate
   a control that in fact runs only on the contributor's own machine. Closing
   this gap makes that constraint true.

The control exists on paper and in tooling; it is simply not run where it would
stop a leak.

## Scope

A new CI check that runs `gitleaks` against the repository's **full commit
history** reachable on the branch, using the committed `.gitleaks.toml`
allowlist and the `.gitleaksignore` fingerprint file, on the same PR and
push-to-`main` triggers as the dependency-audit gate, and fails the build on any
finding that is not already allowlisted or fingerprint-accepted.

**In scope**

| Item | What it means |
| --- | --- |
| A named `check-secrets` check | Appears on every pull request and on push to `main`; visible on the checks tab, same as `check-audit`. |
| Scans full reachable history, not only the diff | The threat is a real secret in *any* commit that reaches `main`. The check scans the branch's full commit history, so the accepted commits recorded in `.gitleaksignore` are actually present to the scan and the four historical findings stay suppressed rather than re-firing. |
| Uses the committed config | The check scans with `.gitleaks.toml` (allowlist) and honors `.gitleaksignore` (the accepted historical findings), so the CI verdict matches what a contributor sees running `gitleaks` locally. |
| Runs on fork PRs with no secret dependency | `gitleaks` needs no repository secrets, so the check runs and reports on pull requests from forks — the external-contributor case the Problem names. |
| Blocks the merge | A red `check-secrets` prevents the PR from merging; the check is a required status check, not an advisory tab. |
| Fails closed on any non-clean result | Any unallowlisted, unaccepted finding — or a scanner that cannot complete — turns the check red. |
| Green on the tree as it stands | The introducing change is itself green over full history; the gate and any needed acceptance land together, never red-walling `main`. |
| `CONTRIBUTING.md` reflects reality | § Security no longer says the gate "is not yet in place"; it states the gate is live, names the config it uses, and states how to accept a verified false positive (allowlist for the current tree, `.gitleaksignore` fingerprint for immutable history). |

**Out of scope**

| Item | Why | Where it belongs |
| --- | --- | --- |
| Pre-commit / pre-push hooks | A local hook is a convenience, not an enforcement boundary; it can be bypassed and is not the merge gate. | A separate developer-experience change if wanted. |
| Rewriting the accepted historical findings | Rewriting public history is disruptive and the exposure is negligible (documented in `.gitleaksignore`, which is the source of truth for that accepted set). | Deliberately declined; recorded in `.gitleaksignore`. |
| Rotating or removing the public demo keys | They are the well-known Supabase demo keys, declared non-secret by § Security. | Not a security defect. |
| Widening the allowlist grammar or the scanner ruleset | This spec enforces the current ruleset, it does not retune it. | Future audit if a false-positive class appears. |
| Any CI-only allowlist entry | The CI scan uses only the committed config; it adds no exemption a local run would not also apply. | The committed `.gitleaks.toml` / `.gitleaksignore` only. |
| Scanning inside `data/synthetic/prose-cache.json` | `.gitleaks.toml` exempts that one vendored, machine-generated file **by path**, so its whole content is unscanned. This gate inherits that accepted blind spot; a secret placed only there would not fire. The file is generated and vendored verbatim, never hand-authored, so it is not a place a contributor pastes a key. | Re-scoping that exemption from path to content is a future allowlist change, not this gate. |

## Constraints

- **Do not duplicate a policy.** The secret-handling policy already lives in
  `CONTRIBUTING.md` § Security. This gate enforces it; it does not restate or
  fork it. A contributor should not have to learn a second policy.
- **CI verdict equals the local verdict.** The check must scan with the same
  `.gitleaks.toml` and `.gitleaksignore` the contributor runs locally, over the
  same full history, so a green local run and a green CI run never disagree. The
  committed config is the only tuning surface; the gate adds no CI-only
  exemptions.
- **Fail closed on any error — no fail-open path.** Unlike the dependency-audit
  gate, whose fail-open-on-outage posture exists because its advisory data is a
  remote service that can be unreachable, the secret scan has no remote
  dependency: its ruleset and config are local. There is therefore no
  infrastructure-error class that justifies passing a PR the scanner could not
  vet. A scanner that cannot complete blocks the merge, exactly as a finding
  does.
- **No `pull_request_target` with untrusted-head checkout.** The check must not
  use a trigger that grants a fork PR's code access to repository secrets or a
  write token; a secret scanner has no need for either, and that combination is
  itself a code-execution vector.
- **The acceptance set narrows, never silently grows.** Every allowlist or
  fingerprint acceptance is a reviewable diff carrying a dated reason under
  security-engineer review, exactly as the audit-baseline model works today.
- **Must not weaken any existing gate** (`check-audit`, `check-edge`, lint,
  typecheck, test, `coaligned`, smoke).
- **Least privilege.** The check reads the repository and nothing more; it
  declares `contents: read`, consistent with the other CI workflows (#96). PR
  annotations or SARIF upload (which would need broader scopes) are out of
  scope, so `contents: read` stays the ceiling.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A `check-secrets` check runs on every PR and on push to `main` | a named check appears and runs on a test PR's checks tab |
| 2 | The check fails when a **non-demo JWT** joins or replaces the exact demo keys in `.env.example`, and when a real key is planted in an ordinary tracked file | a throwaway PR planting both turns the check red, proving the `.gitleaks.toml` allowlist exempts only the exact demo values (value-scoped), not the `.env.example` file and not the tree at large |
| 3 | The check scans full reachable history and stays green over it — the `.gitleaksignore`-accepted historical commits do not re-fire | the introducing PR's check log shows a full-history scan reporting zero unaccepted findings |
| 4 | The introducing PR is itself green — gate and any needed acceptance land together | the PR merges without red-walling `main` |
| 5 | The CI verdict matches the documented local `gitleaks` run — same `.gitleaks.toml`, same `.gitleaksignore`, same history | a locally-clean tree is clean in CI; the check log shows both config files in use |
| 6 | The check runs and reports on a pull request opened from a fork | a fork PR shows the `check-secrets` result on its checks tab |
| 7 | A red `check-secrets` blocks the merge | `check-secrets` is a required status check; a PR with a planted secret cannot be merged |
| 8 | A scanner that cannot complete fails the check closed — there is no path that passes a PR the scanner did not vet | an induced scanner failure turns the check red, not green |
| 9 | `CONTRIBUTING.md` § Security states the gate is live, names the config, and states the false-positive acceptance rule for both the current tree and immutable history | `CONTRIBUTING.md` |

— Security Engineer 🔒
