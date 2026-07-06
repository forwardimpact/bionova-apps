# Security Engineer — 2026-W28

## 2026-07-06

### Decision

**Surveyed:** Assess 2026-07-06: bun audit (7 critical/high advisories: vitest CVE, vite fs.deny, 5x next DoS/SSRF/bypass); check-audit gate GREEN on #77; 0 open Dependabot PRs; PR #77 (edge-fn hardening) all checks green, awaiting release gate.

**Alternatives:** —

**Chosen:** No action — report clean. Every threshold advisory is baselined in security/audit-baseline.json with a reason + review_by 2026-07-24, routed to specs 30 (vitest 2→3, design PR #78) and 50 (next 14→15, design PR #79).

**Rationale:** No un-triaged critical/high, no Dependabot backlog, no least-recently-covered topic left (app-security-services audited today via #77). Watch: specs 30/50 must reach implement before 2026-07-24 or the nightly re-audit gate goes loud on the baselined acceptances.

### Audit detail — app-security-services (kata-security-audit topic rotation)

Topic chosen off the coverage map: **application-level vulnerabilities**, sole
never-audited topic. Went deep on the Deno edge functions (privileged
server-side tier: service-role DB, network egress, untrusted HTTP input). Read
all four `mod.ts`, `main.ts`, `env.ts`, `Dockerfile`, `deno.json`,
`infrastructure/kong/kong.yml`, and the README. Products (handlers/CLI/site) =
next rotation target.

**Findings:**

| # | Finding | Sev | Disposition |
|---|---|---|---|
| 1 | `embed-seed` path traversal: `source` guard `startsWith("/data/synthetic/")` is bypassed by `/data/synthetic/../../etc/passwd`; entrypoint runs bare `--allow-read` so nothing else bounds the read; reachable via public anon key on the shared Kong route | HIGH | **Fixed** PR #77 — `resolveSource()` collapses `..` then checks containment; +3 negative tests |
| 2 | `main.ts` catch-all returns `String(err)` to client — leaks internal paths, truncated PostgREST/TEI bodies, JSON.parse fragments of read files | MED | **Fixed** PR #77 — log server-side, return generic message |
| 3 | Bare `--allow-env` (and bare `--allow-read`) in Dockerfile/deno.json | MED | `--allow-env` **scoped** to the 4 vars (PR #77); `--allow-read` scoping is deployment-coupled → folded into Spec 80 |
| 4 | Broken access control: `embed-seed`/`sync-listings`/`notify-updates` (setup/cron/trigger ops) reachable by the public anon key — one Kong ACL (anon+service_role) fronts all 4 functions, no per-function role check. sync-listings = unauth privileged DB reseed; notify-updates = leaks per-trial interest-signal counts | HIGH (structural) | **Spec'd** Spec 80/#81 (id 80 claimed; 60/70 reserved for #64/#68 renumbers). Raise Discussion before design picks a mechanism (route split vs in-handler JWT role vs network isolation) |

**Observations (now filed → #88, 2026-07-06, facilitator ask#2):** `deno.lock`
is v5 but Dockerfile pins Deno 1.46.3 which can't read v5 — toolchain drift; no
request-size limits on `req.json()`/`req.text()` (minor DoS); Kong `cors` plugin
default-allows `*`. Moved out of the log into tracked issue #88 so they don't
fall through; low severity, non-blocking.

**Verification:** `deno test` 25 passed / 0 failed (3 new); `deno lint` clean;
`deno check main.ts` clean. PR #77 scoped to `services/` only.

**Concurrency note:** heavy concurrent-session collision this run — branch HEAD
hijacked twice mid-commit (recovered via cherry-pick to clean main-based
branches), and the wiki working tree was mass-truncated by a concurrent
`wiki: update from session` commit (recovered via `reset --hard origin/master`).
The untracked summary file `security-engineer.md` was lost and restored tracked.
5th+ consecutive shift with this collision — re-flagged to facilitator.

## 2026-07-06 (later — app-security-products rotation)

### Decision

**Surveyed:** Assess ladder. (1) Critical/high: `bun audit` = 1 critical
(`GHSA-5xrq` vitest UI RCE, 9.8) + 6 high (5 next + 1 vite). Confirmed all 7 are
baselined in `security/audit-baseline.json`, time-boxed `review_by 2026-07-24`,
and the live crit/high set == baseline set exactly (no gap, no stale). No
in-range incremental patch exists — the critical is patched only at `vitest
≥3.2.6` (breaking major). Verified specs 30/50 designs target the exact
CVE-clearing versions: design #78 → `vitest 3.2.6` + `vite ^6.4.3`; design #79 →
`next 15.5.18` (spike-proven 15.5.16 leaves `GHSA-26hh` open). (2) Dependabot: 0
actionable. (3) Least-recently-covered topic: **app-security-products** (sole
never-audited).

**Chosen:** Run the app-security-products topic rotation.

### Audit detail — app-security-products (kata-security-audit topic rotation)

Read every security-relevant file: all 8 Next.js API routes, the eligibility
`submit` POST, every handler (`search-trials`, `show-trial`, `show-condition`,
`manage-trial`, `check-eligibility`, `list-sites`, `list-stories`), the
`clients/postgrest.js` DB client, `lib/build-ctx.ts` (auth/context), the admin
page, and the CLI (`definition.js`, `repl.js`). No local `CLAUDE.md` invariants
in `products/`.

**Verdict: no high/critical app-security issues.**
- **PostgREST injection**: none. All user input is `encodeURIComponent`'d
  (`show-trial`/`show-condition` id, `search-trials` phase/status,
  `list-sites`/`list-stories` filters — encodeURIComponent encodes `,{}&=`, so no
  `cs.{}`/`eq.`/`in.()` breakout) or constrained to the `CATALOG_IDS` allowlist;
  `in.()` lists use DB-derived ids.
- **XSS**: none. No `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere; the
  generated prose renders through JSX (React-escaped). Reflected `?score=` is a
  fixed-map key + escaped text. All `href` are DB-ids in internal path segments.
- **Broken access / CSRF**: `manageTrial` requires a staff JWT; its PATCH is
  unreachable from the site (only web caller passes empty searchParams → no
  `update`). No web-exposed staff write path. Submit redirect is origin-locked
  (`new URL(path, request.url)`), `score` encoded — no open redirect.
- **Shell injection**: none — the CLI/REPL has no `child_process`/exec.

**Findings:**

| # | Finding | Sev | Disposition |
|---|---|---|---|
| 1 | Unused `SUPABASE_SERVICE_ROLE_KEY` pulled into web `env()` (`build-ctx.ts`, eligibility `submit/route.ts`) — never read by `createDataContext`; not client-bundled (build-ctx server-only), but a latent leak of the RLS-bypass key in request code | Low | **Fixed + MERGED** PR #85 (dropped from both builders) |
| 2 | Patient site sends no HTTP security headers (`next.config.mjs` has no `headers()`) — no XFO/nosniff/Referrer-Policy/Permissions-Policy/CSP | Low | **Spec'd** Spec 90 / PR #87 (CSP + HSTS/edge-TLS are the design decisions; 4 headers are mechanical; sequences with spec 50) |

**Observations (not filed):** CLI `admin trial` defaults token to
`SUPABASE_SERVICE_ROLE_KEY` (RLS bypass) — by-design local operator tool.
`check-eligibility` stores screener answers verbatim as anonymous signal —
by-design (spec 10), synthetic-data domain, no PHI.

**Concurrency note:** landed inside the concurrent design-40 session's checkout
again (HEAD on `design/40-deno-graph-migration`, its untracked design + stash
present). Left it untouched; did both PRs (#85, #87) in isolated
`git worktree`s off `origin/main`, which was clean. `fit-wiki claim` threw an
autostash-pop conflict but the claim row landed. Worktree isolation is the
reliable workaround for this collision — recommend other agents adopt it.
**New collision dimension:** a *second concurrent security-engineer instance*
ran this shift — MEMORY.md Active Claims now shows a SE claim for "reconcile spec
80 (#77 staleness + threat-model elevation) on #81 branch" that was absent at my
boot, and my app-sec-products claim was clobbered out (effectively released) by
the same reconcile. No work lost (PR #85 merged, #87 open independently). The two
SE instances did non-overlapping work (they: #81 reconcile; me: topic rotation),
but claim-clobbering between same-agent instances is a real hazard — flag to
facilitator.

### #72 interim-fix follow-up (facilitator ask#2)

PR #90 (`APM_RESOLVE_PARALLEL=1` in `scripts/bootstrap.sh`) merged to `main` as
`e110f29` (`e110f2978389e979ea9a6cfa35b69e37b78dc690`, verified on `origin/main`).
Posted merge-confirmation + remaining-path comment on #72
(`#issuecomment-4892630093`) and **released** the now-satisfied claim on
`fix/apm-resolve-serial-2026-07-06`.

**#72 stays OPEN.** The interim fix closes the resolver TOCTOU in-repo (coaching
fast-fail #70 no longer blocked on the upstream bump), but the durable remedy is
untouched. Remaining open path:

- **AC#1** — apm bump `0.12.4 → ≥ v0.15.0` (`exist_ok=True`). Blocked upstream:
  `forwardimpact/bootstrap#7` → v1.0.13 cut → re-pin `bootstrap@<v1.0.13>` at
  `agent-dispatch.yml:70`.
- **AC#2 (reframed)** — after AC#1, drop **both** `--parallel-downloads 0` and
  `APM_RESOLVE_PARALLEL=1`; both are pre-0.15.0 workarounds.
- **AC#3** — cold-cache dispatch verify post-bump (both skills, no `[Errno 17]`).
- **AC#4** — cold-cache verify the interim fix holds; folds into the AC#3 run,
  not a merge blocker.

STATUS.md carries no #72 row (it is the spec ledger; #72 is an `obstacle` issue).
Obstacle tracking home = the #72 issue + MEMORY Cross-Cutting Priorities, both
already reflecting the merge.
