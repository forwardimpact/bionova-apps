# Spec 70 — CI secret-scan gate

**Classification:** Internal. This is a supply-chain / repository-hygiene
control, not patient-facing product. It protects the deployment behind all three
JTBD jobs by keeping a leaked credential out of a world-readable history; it
serves no job directly.

## Problem

`CONTRIBUTING.md` asserts a security control that does not exist (current
`main` wording):

> `gitleaks` runs before push. Resolve every finding; document any verified
> false positive in the pull request.

The claim was surfaced as doc/reality drift while the technical writer reviewed
the `## Security` section for PR #37. The repository contradicts it:

| Claimed | Reality (verified across the repo) |
| --- | --- |
| `gitleaks` runs before push | Zero pre-push infrastructure: no `.husky/`, no `lefthook` config, no `core.hooksPath`, no `.git/hooks/pre-push` |
| An automated scan gate exists | No `.gitleaks.toml`/`.gitleaksignore`, no CI workflow running gitleaks or any scanner (trufflehog, detect-secrets) |
| — | The lone `gitleaks` mention in the repo proper is that one sentence |

Two facts make the gap a real risk, not cosmetic:

1. **The repository is public and permanent.** `CONTRIBUTING.md` itself states:
   "Assume every commit is world readable, forever." A real credential pushed
   here is unrecoverable — rotation is the only remedy, and only if someone
   notices.
2. **A stated-but-absent control is worse than silence.** Contributors read the
   bullet as assurance that secrets are caught before they leave a machine.
   They aren't. False assurance suppresses the manual vigilance that is
   currently the *only* thing standing between a pasted key and `main`.

A client-side pre-push hook cannot close this gap on a public repo: git hooks
are not distributed by clone, so external contributors (who run Node.js + `npx`
per `CONTRIBUTING.md`) never receive one, and any hook is bypassable with
`--no-verify`. The only enforceable form of "scanned before it reaches `main`"
is a server-side CI gate on pull requests and pushes to `main` — the same shape
as the merged `check-audit` dependency gate (issue #22, PR #26).

## Why it matters

The dependency-audit gate (`check-audit`) already establishes that this repo
enforces supply-chain controls in CI, not in advisory prose. A secret-scan gate
is the credential-leak analog of that control and completes the `## Security`
section's promise. Without it, the section documents one real gate (dependency
audit) beside one phantom gate (secret scan), which erodes trust in the whole
section.

## Scope

**In scope**

| Component | What it does |
| --- | --- |
| Secret-scan CI workflow | Runs a secret scan on `pull_request` and `push` to `main`, failing the build on any finding not covered by the allowlist. |
| Allowlist configuration | Suppresses only the documented, verified false positives (below), scoped narrowly enough that a real credential in the same file is still caught. Every entry carries a reason. |
| Coverage-boundary note | A stated no-false-green boundary — what the gate does and does not detect — recorded with the gate and reflected in `CONTRIBUTING.md`. |
| `CONTRIBUTING.md` bullet upgrade | Rewrites the secret-scan bullet to assert the real CI gate by name (replacing the interim recommended-local-step wording). Ships in the same PR as the gate, so bullet and workflow become true together on merge. |

The incumbent scanner is `gitleaks` (the tool the current bullet already names
and the one available in the toolchain). Whether the gate invokes it as a
pinned Action or a pinned binary, its exact flags, and the allowlist file format
are design/plan decisions, not spec decisions.

**Known false positives the allowlist must cover.** A `gitleaks 8.30.1` scan of
the current tree reports 31 findings, every one a false positive. The count is a
point-in-time baseline, not a contract — the success criteria key off these
documented surfaces, not off the number 31.

| Rule | Location(s) | Count | Why it is not a secret |
| --- | --- | --- | --- |
| `generic-api-key` | `data/synthetic/prose-cache.json` | 27 | Vendored synthetic domain prose (see `PROVENANCE.md`); high-entropy generated strings trip the heuristic. Contains no credentials. |
| `jwt` | `.env.example` | 2 | The well-known public Supabase demo keys for the local stack, documented as non-secret in `CONTRIBUTING.md`. Public by design; never rotated. |
| `jwt` | `infrastructure/kong/kong.yml` | 2 | The same public demo keys, mirrored into the gateway config. |

**Out of scope**

- Client-side pre-push or pre-commit hooks (unenforceable on a public repo;
  undistributed by clone). Local scanning stays a *recommended* step.
- Rewriting existing history to purge the already-committed demo keys — they are
  intentionally public.
- Scanning surfaces the dependency-audit gate already owns.

## Success criteria

| # | Criterion | Verify |
| --- | --- | --- |
| 1 | A CI workflow runs a secret scan on `pull_request` and `push` to `main`, and any finding not covered by the allowlist fails the job. | Workflow present and wired into checks; a branch that adds a fake credential to an ordinary source file turns the check red. |
| 2 | The gate is green on the current `main` tree *because its allowlist suppresses the documented false positives* — not because a bare scan finds nothing. | Run the gate as wired in #1 (with its allowlist) against `main` HEAD → exit 0; the same scan *without* the allowlist still reports the documented false positives. |
| 3 | The allowlist is scoped by rule and path narrowly enough that a real credential in an allowlisted file is still caught and a real credential of a suppressed rule elsewhere is still caught; every entry maps to a documented false positive. | (a) A *different*-rule fake credential planted inside an allowlisted path (e.g. a fake AWS key in `prose-cache.json`) turns the check red — the suppression is not whole-file. (b) A *same*-rule real-looking credential in a non-allowlisted file (e.g. a high-entropy `generic-api-key` in a source file) turns the check red — the suppression is not rule-wide. (c) Each allowlist entry maps to a row in the false-positive table. |
| 4 | The gate's coverage boundary is stated plainly with the gate and in `CONTRIBUTING.md`, naming concrete classes it does not detect. | The note names at least: secrets already committed before the gate existed, and secrets that match no enabled rule. |
| 5 | Once the gate is on `main`, `CONTRIBUTING.md`'s secret-scan bullet names the shipped gate and no longer claims a pre-push hook. | The bullet text names the gate and matches the merged workflow. |

## Relationship to adjacent work

- **Interim doc fix (separate, mechanical):** until this gate lands, the
  `CONTRIBUTING.md` bullet is reworded to a recommended local step (a
  technical-writer doc change on its own `fix/` branch, not a numbered spec) so
  the doc stops asserting a control that does not exist. That reword is the
  bridge; this spec is the destination, and criterion 5 replaces the interim
  wording when the gate merges.
- **PR #37 (`check-audit` policy doc):** this gate's `CONTRIBUTING.md` upgrade
  sits alongside PR #37's `### Dependency audit gates` subsection so the two
  controls read as one coherent block. This spec does not touch the PR #37
  branch (release-engineer scope).
- **`check-audit` (issue #22, PR #26):** the precedent for a merge-blocking CI
  security gate and the model for triggers and standalone-workflow structure —
  the concrete shape is a design decision.

— Security Engineer 🔒
