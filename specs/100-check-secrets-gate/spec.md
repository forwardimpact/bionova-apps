# Spec 100 — `check-secrets` CI gate: enforce in CI the secret-scan control that is today local-only

**Classification:** Internal (CI/security infrastructure). It ships no product
behavior; it defends the repository-wide invariant that no real secret ever
lands in a public, permanently-readable history.

**Persona / job:** The affected actor is every contributor and every fork-PR
author, on the job "merge to `main` without landing a real secret." It backstops
every job by protecting the `CONTRIBUTING.md` § Security invariant ("assume every
commit is world readable, forever") at the one point where a leak becomes
irreversible — the merge to `main`.

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
allowlist and the `.gitleaksignore` fingerprint file, on **two** of the
dependency-audit gate's three triggers — **pull request and push to `main`**,
**not** its daily `schedule` cron — and fails the build on any finding that is
not already allowlisted or fingerprint-accepted. The cron is deliberately
omitted: a secret scan has no remote advisory feed that can flip a verdict
against unchanged history, so a nightly re-run adds no value; copying
`check-audit.yml`'s triggers verbatim would inherit an idle scheduled scan.

**In scope**

| Item | What it means |
| --- | --- |
| A named `check-secrets` check | Runs and appears on the checks tab on every pull request and on push to `main` — the same two triggers as `check-audit`, **excluding** its daily `schedule` cron (see Scope prose for why). |
| Scans full reachable history, not only the diff | The threat is a real secret in *any* commit that reaches `main`. The check scans the branch's full commit history, so the accepted commits recorded in `.gitleaksignore` are actually present to the scan and the four historical findings stay suppressed rather than re-firing. |
| Uses the committed config | The check scans with `.gitleaks.toml` (allowlist) and honors `.gitleaksignore` (the accepted historical findings), so the CI verdict matches what a contributor sees running `gitleaks` locally. |
| Runs on fork PRs with no secret dependency | `gitleaks` needs no repository secrets, so the check runs and reports on pull requests from forks — the external-contributor case the Problem names. |
| Blocks the merge (once required) | A red `check-secrets` prevents the PR from merging **once the check is registered in branch protection's required set**. The workflow file only *produces* the check run; making it *block* is an out-of-tree branch-protection admin action, owned by the trusted-human maintainer (`dickolsson`), sequenced after first green on `main` — see the "Requiredness is a branch-protection admin action" constraint. |
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
  does. A missing or malformed `.gitleaks.toml` / `.gitleaksignore` is one such
  incomplete run: the scanner cannot load its committed config, so it fails the
  check closed rather than scanning with defaults or skipping the file.
- **No `pull_request_target` with untrusted-head checkout.** The check must not
  use a trigger that grants a fork PR's code access to repository secrets or a
  write token; a secret scanner has no need for either, and that combination is
  itself a code-execution vector.
- **The acceptance set narrows, never silently grows.** Every allowlist or
  fingerprint acceptance is a reviewable diff carrying a dated reason under
  security-engineer review, exactly as the audit-baseline model works today.
- **Requiredness is a branch-protection admin action, sequenced after green.**
  A workflow file only *produces* a `check-secrets` check run; whether a red run
  actually *blocks* merge lives in the branch-protection "required status
  checks" setting for `main` — an admin-only surface the CI integration token
  cannot write (it gets `403` there, the same wall the dependency-audit gate's
  requiredness sits behind). Registering `check-secrets` in that required set is
  therefore an out-of-tree action owned by the **trusted-human maintainer with
  repo-admin rights (`dickolsson`)**, not by this change's diff. It must be
  registered **only after the check has reported green at least once on `main`**
  — never before. Registering a required check that has never reported wedges
  *every* open PR on a check that will never turn green, stalling the merge
  queue repo-wide. Order: land the workflow (green over full history) → confirm
  the green run on `main` → then the maintainer flips requiredness on.
- **The allowlist config is itself a human-review-gated bypass surface.** A
  future PR that plants a secret *and* a matching `.gitleaks.toml` /
  `.gitleaksignore` entry in the same diff scans clean — the gate cannot
  self-detect an exemption authored to hide the very secret it exempts. The
  closing control is human review of any diff touching those two files: the
  `.github/CODEOWNERS` wildcard already routes them to the agent team, but this
  spec requires an explicit CODEOWNERS entry assigning `.gitleaks.toml` and
  `.gitleaksignore` to security-engineer / trusted-human review, made blocking
  by the same "require review from code owners" branch-protection setting the
  requiredness action (above) covers. Until that CODEOWNERS-plus-branch-
  protection pairing lands, the residual is **accepted on the record** as gated
  by the existing trusted-human merge approval — no PR merges without it — and
  by the "acceptance set narrows, never silently grows" constraint. The gate
  does not, and cannot, close this surface by itself.
- **Must not weaken any existing gate** (`check-audit`, `check-edge`, lint,
  typecheck, test, `coaligned`, smoke).
- **Least privilege.** The check runs with a read-only token — no write scope,
  no secrets access — consistent with the least-privilege posture the other CI
  workflows adopted (#96). PR annotations or SARIF upload, which would need
  broader scopes, are out of scope, so read-only stays the ceiling. The exact
  permission token is a design decision, not a spec constraint.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A `check-secrets` check runs on every PR and on push to `main` | a named check appears and runs on a test PR's checks tab |
| 2 | The check fails when a **non-demo JWT** joins or replaces the exact demo keys in `.env.example`, and when a real key is planted in an ordinary tracked file | a throwaway PR planting both turns the check red, proving the `.gitleaks.toml` allowlist exempts only the exact demo values (value-scoped), not the `.env.example` file and not the tree at large |
| 3 | The check scans full reachable history and stays green over it — the `.gitleaksignore`-accepted historical commits do not re-fire, and the green is achieved without widening the acceptance set | the introducing PR's check log shows a full-history scan reporting zero unaccepted findings, **and** the PR diff adds no new `.gitleaks.toml` or `.gitleaksignore` entry — a durable, diff-checkable artifact that the ephemeral check log does not by itself preserve |
| 4 | The introducing PR is itself green — gate and any needed acceptance land together | the PR merges without red-walling `main` |
| 5 | The CI verdict matches the documented local `gitleaks` run — same `.gitleaks.toml`, same `.gitleaksignore`, same history | a locally-clean tree is clean in CI; the check log shows both config files in use |
| 6 | The check runs and reports on a pull request opened from a fork | a fork PR shows the `check-secrets` result on its checks tab |
| 7 | A red `check-secrets` blocks the merge — **after** the maintainer registers it as required, and **only** once it has first reported green on `main` | the trusted-human maintainer (`dickolsson`) adds `check-secrets` to `main`'s required-status-checks set after the first green run on `main`; a PR with a planted secret then cannot be merged. Registration before the first green run is explicitly disallowed (it would wedge every open PR) |
| 7a | The two allowlist-config files carry an explicit code-owner review requirement | `.github/CODEOWNERS` names a security-engineer / trusted-human reviewer for `.gitleaks.toml` and `.gitleaksignore`; a diff touching either requires that review before merge (made blocking by branch protection's code-owner-review setting) |
| 8 | A non-zero `gitleaks` exit for any reason **other than a findings exit** — crash, timeout, or unloadable config — fails the check closed; there is no path that passes a PR the scanner did not vet | an induced scanner failure (e.g. a malformed config) exits non-zero for a non-findings reason and turns the check red, not green. (Findings exit and error exit both fail closed identically — the distinction is defensive framing only, so the plan should **not** branch on the specific exit code: any non-zero fails the check.) |
| 9 | `CONTRIBUTING.md` § Security states the gate is live, names the config, and states the false-positive acceptance rule for both the current tree and immutable history | `CONTRIBUTING.md` |

— Security Engineer 🔒
