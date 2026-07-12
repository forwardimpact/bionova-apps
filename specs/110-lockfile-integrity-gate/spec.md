# Spec 110: The committed `bun.lock` must be authoritative and CI-enforced

**Classification:** internal. This is CI and supply-chain tooling with no
patient-, physician-, or staff-facing surface. It has no direct
[JTBD](../../JTBD.md) persona job, but it protects a stated promise of this
repository: it is the reference example of an external team consuming Forward
Impact shared libraries, and reproducible installs are part of that contract.

## Problem

The committed `bun.lock` is not an authoritative pin. It can drift from the
workspace `package.json` manifests, and nothing in CI catches or prevents the
drift. The audited and installed dependency tree can silently diverge from what
the lockfile records.

Evidence is from the dependency-hygiene audit in issue #103. It is the
git-history before-state at commit `a702515`, the last commit where the lock
drifted from the manifests. Commit `0424959` (#147, spec 30) reconciled the lock
on 2026-07-08, so `bun install --frozen-lockfile` now exits 0 on `main`. The
observation below records that historical before-state, not a current failure. A
bare `bun install` in a working tree regenerated the lock locally and masked the
drift, so the drift was visible only against the committed file at `a702515`, not
a post-install tree.

| Observation | Evidence |
| --- | --- |
| The committed lock did not match the manifests at `a702515` | At commit `a702515`, `bun install --frozen-lockfile` against the committed lock failed with `lockfile had changes, but lockfile is frozen`. Commit `0424959` (#147) has since reconciled the lock, so the same command exits 0 on `main` today. Six packages were pinned in the lock behind their manifests. Five were first-party and one release behind: `@forwardimpact/libcli`, `libformat`, `librepl`, `libtemplate`, `libui`. The sixth, `eslint-config-prettier`, was a full major behind: version 9 in the lock, 10 in the manifest |
| The manifests moved without the lock | The drift traces to merged Dependabot PRs #52 and #53, which changed `package.json` files only. Dependabot's npm ecosystem does not manage the Bun lockfile |
| CI never enforces the lock | Seven CI install steps run a bare `bun install`, across `check-audit.yml`, `check-test.yml`, `check-e2e.yml`, `check-seed.yml`, `check-quality.yml` (two steps), and `check-context.yml`. The remaining `check-*` workflows run no `bun install`. A bare install resolves the manifests fresh and regenerates the lock in the runner, so drift never fails a build |
| No policy states the requirement | `CONTRIBUTING.md` § Dependency audit gates covers advisory gating but says nothing about lockfile integrity or a committed-lockfile requirement |

The observed drift was benign in content. It was five first-party bumps plus one
devDependency major, all matching versions the manifests already requested, with
no unknown or typosquatted package introduced. The problem is systemic, not this
particular drift. Because the committed lock is not authoritative, a compromised,
yanked, or unexpectedly-bumped transitive dependency can enter the resolved tree
with no lockfile diff to review.

## Why it matters

A lockfile exists to make installs reproducible and to give reviewers a diff to
inspect when the dependency tree changes. Today it does neither reliably. For a
repository whose whole purpose is to be a trustworthy reference for consuming
shared libraries, an install that silently resolves away from the committed
pins undermines the example it is meant to set.

## Scope

In scope:

- CI must fail a pull request when the committed `bun.lock` disagrees with the
  workspace manifests.
- Dependabot pull requests, which update manifests only, must still be able to
  reach a green, mergeable state under the new enforcement.
- The currently-stale `bun.lock` on `main` is brought into agreement with the
  manifests so the enforced state is reachable.
- `CONTRIBUTING.md` states the committed-lockfile requirement and how a
  contributor updates the lock after changing a manifest.

Out of scope:

- `scripts/bootstrap.sh`, which also runs a bare `bun install`. It is the
  agent-dispatch bootstrap and runs in fresh, non-pull-request environments
  where a frozen install that hard-fails would block agent boot. Frozen-install
  enforcement stays in the pull-request `check-*` workflows and out of
  `bootstrap.sh`.
- The Deno dependency tree in `services/polaris-functions`. Its lockfile and
  audit gate are governed separately; this spec covers the Bun workspace only.
- Choosing the enforcement mechanism (a post-update lock-commit step,
  Dependabot lockfile support, a dedicated consistency-check job, or converting
  the existing install steps to frozen installs) and its sequencing. Mechanism
  selection belongs to the design and plan.

## Success criteria

1. A pull request in which the committed `bun.lock` disagrees with the workspace
   manifests fails a CI check that runs on pull requests. Verify: push a PR that
   bumps a manifest version and leaves the lock stale; a check run reports
   failure.
2. After this work merges, installing the unchanged tree leaves `bun.lock`
   unchanged. Verify: a fresh install on `main` produces no diff to `bun.lock`.
3. A dependency bump can reach a state where its lock agrees with its manifests,
   so a Dependabot pull request stays mergeable. Verify: once the lock is
   updated to match the bumped manifest, the same PR passes the check that
   failed it while stale.
4. `CONTRIBUTING.md` states that `bun.lock` is committed and CI-enforced and
   describes how a contributor updates it after a manifest change. Verify: the
   dependency guidance in `CONTRIBUTING.md` contains both the committed-lockfile
   requirement and the update step.

— Product Manager 🌱
