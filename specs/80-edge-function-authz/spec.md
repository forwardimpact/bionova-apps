# Spec 80 — Privileged edge functions must not be callable with the public anon key

**Classification:** Internal (security hardening of the edge-function tier). It
ships no new product behavior; it removes an unauthorized path to privileged
server-side operations that back the product.

**Persona / job:** No direct persona. It defends the Clinical Development Staff
job **Keep Listings True** (JTBD.md:37) and the anonymous patients behind
`interest_signals`: the affected functions reseed listings, embed seed prose, and
read interest signals with the service-role key, and today any holder of the
public anon key can drive or read them.

## Problem

The `app-security-services` audit (2026-07-06) found that all four Polaris edge
functions share a single authorization boundary that does not match their
privilege levels.

1. **One Kong ACL fronts four functions of unequal privilege.** The
   `functions-v1` Kong route gates on `key-auth` + `acl` allowing **both `anon`
   and `service_role`**. The anon key is public by design — it is shipped to the
   browser and is the well-known Supabase demo key committed in the Kong config
   and `.env.example`. So every function is reachable by anyone.

2. **The handlers do no per-function authorization.** The router dispatches on
   the path segment and calls each handler with the service-role env; no handler
   inspects the caller's role. There is no second gate behind Kong.

3. **Three of the four functions are not meant to be anon-facing** (per the
   functions README's trigger column):

   | Function | Intended trigger | Exposure today | Risk if anon-called |
   |---|---|---|---|
   | `eligibility-check` | screener POST (web/CLI) | anon — **correct** | none; this is the public path |
   | `embed-seed` | `setup.sh`, once | anon | drives TEI + service-role writes to `condition_embeddings` on demand; long-running (10-min Kong timeout) |
   | `sync-listings` | `pg_cron` / manual admin | anon | **unauthenticated privileged DB write** — reseeds `trials`/`criteria`; the README's own example authenticates it with `$SERVICE_ROLE_KEY`, confirming intent is service-role-only |
   | `notify-updates` | DB trigger on `trials.status` | anon | discloses the **count of interest signals per trial** to any caller — patient-interest data the app otherwise keeps anonymous |

   The intent-vs-enforcement gap is explicit: `sync-listings`' own documented
   invocation passes the service-role key, yet Kong lets the anon key through.

This is broken access control (OWASP A01). The concrete arbitrary-file-read and
info-leak defects on the same reachable surface were fixed in **PR #77, merged
to `main` on 2026-07-06 (`0325971`)** — the `embed-seed` path traversal, the
`String(err)` info-leak, and `--allow-env` scoping. This spec covers the
structural authorization gap that fix does not close. The one piece #77 deferred
rather than fixed — scoping the still-bare `--allow-read` on the functions
entrypoint — stays in scope here (see Scope).

**Threat surface beyond Kong.** The functions container listens on `:8000` and
is reachable directly on the compose/docker network with no gate at all — Kong
is one path to it, not the only one. A fix that only splits the Kong route
therefore does **not** defend the direct `:8000` path; only an in-handler role
check does. Any mechanism choice must state which of these two surfaces it
covers (see Notes for design).

## Scope

**In scope:**

| Component | What it must do |
|---|---|
| Authorization boundary for privileged functions | `embed-seed`, `sync-listings`, and `notify-updates` must reject callers presenting only the anon credential; only a service-role (or equivalently privileged internal) caller may invoke them |
| Preserved public path | `eligibility-check` must remain callable with the anon key — the screener UI/CLI depends on it |
| Scoped `--allow-read` for the functions container | The entrypoint's remaining bare `--allow-read` (Dockerfile:30) must be scoped to the paths the functions actually read, so a future input-handling defect cannot read the whole container filesystem. Deferred by PR #77 (merged `0325971`) rather than fixed, because it is deployment-coupled (the Deno cache dir must stay readable) and could not be verified without a container run — this is the sole remaining item from that surface |
| Regression coverage | An automated check demonstrates an anon-only caller is refused by each privileged function and accepted for `eligibility-check` |

**Out of scope:**

- The `embed-seed` path-traversal fix, the `String(err)` info-leak fix, and
  `--allow-env` scoping — fixed in PR #77 (merged `0325971`, 2026-07-06).
  Unconditionally out of scope. The `--allow-read` scoping #77 deferred is the
  exception and is **in** scope above.
- Rotating the committed demo anon/service keys — a separate operational concern;
  this spec must hold regardless of which keys are configured.
- Email delivery for `notify-updates` (deferred per its own design).
- Any change to `eligibility-check`'s behavior or scoring.
- **Restricting the Kong `cors` origin allowlist — considered and deferred**
  (audit observation 3, #88). The `functions-v1` route runs the `cors` plugin
  with no config, so it default-allows any origin (`*`). This is not adopted,
  here or elsewhere, because CORS is not the control that gates these routes:
  they are gated by the `apikey` header (`key-auth`), not by ambient cookie
  credentials, so a malicious origin has no CSRF vector and cannot read a
  response without already holding the key. For the privileged routes the
  controlling boundary is the anon-rejection this spec adds; an origin
  allowlist would be strictly dominated by it. `*` is also the correct posture
  for the public `eligibility-check` read surface (no JTBD pulls for origin
  restriction, and a lockdown would risk legitimate share/embed flows).
  Revisit only if credentialed (cookie-based) browser auth is ever introduced.

## Constraints

- **Never weaken an existing control.** The public `eligibility-check` path, the
  `key-auth`/`acl` gate on the REST and Realtime routes, and every current CI
  gate stay intact.
- **Fail closed.** A caller whose role cannot be established as privileged is
  denied, not defaulted to allowed.
- **Do not couple to the demo keys.** The boundary must be defined by role, not
  by a specific key value, so key rotation does not reopen the gap.
- **Local-dev parity.** Local development must retain a working path to the
  functions, without that path reopening the anon gap through Kong. (The specific
  direct-container path is left to the design — see Notes.)
- **Decide the direct `:8000` surface explicitly.** The design must state whether
  the direct `:8000` container surface (reachable on the compose/docker network,
  bypassing Kong) is **closed** by the chosen mechanism or **accepted as residual
  risk**, with rationale. A route-split-only mechanism does not defend it (see
  Threat surface beyond Kong); the design may not leave that outcome implicit.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | An anon-credentialed request to `sync-listings`, `embed-seed`, or `notify-updates` through Kong is refused | a request with the anon key to each returns 401/403, not a 2xx |
| 2 | A service-role-credentialed request to those three functions still succeeds | a request with `apikey: $SERVICE_ROLE_KEY` to each returns 2xx (asserted in the SC5 regression test), and `setup.sh` / the `pg_cron` sync path still work end-to-end |
| 3 | An anon-credentialed request to `eligibility-check` still succeeds | the screener flow (`smoke.sh`) stays green |
| 4 | The functions container grants read only to the paths it uses; a request that resolves outside them cannot be read even if an input check is bypassed | the entrypoint's `--allow-read` is scoped, a `Deno.readFile` of a path outside the **full** allowlist — the mounted seed/migrations paths **and** the Deno cache dir, not merely `/data` — is denied with `PermissionDenied` under Deno's permission model, **and** the container still starts and serves `/health` |
| 5 | A regression test encodes the anon-refused / service-role-accepted matrix for all four functions, **regardless of invocation path** — if the chosen mechanism must also defend the direct `:8000` surface, the test exercises that path too, so a green Kong-only check (SC1) cannot mask an open container port | the test file and a green run |
| 6 | No existing gate or the public screener path is weakened | `just lint`, `just test`, `just smoke`, and the REST/Realtime auth behavior are unchanged |

## Notes for design

The WHAT is "privileged functions reject anon"; the HOW has at least three
distinct mechanisms, each with trade-offs the design should weigh:

- **Split the Kong route.** Give the privileged functions their own route with an
  `acl` allowing only `service_role`, leaving `eligibility-check` on the
  anon-allowed route. Keeps enforcement at the gateway; needs per-function path
  routing in `kong.yml`.
- **In-handler role check.** Verify the caller's role inside each privileged
  handler (or a shared wrapper in `main.ts`) and 401 on non-service-role. This is
  the only option that also defends the direct `:8000` surface. **Open question
  the design must resolve:** how does the caller's role reach the handler? Either
  Kong injects a trustworthy authenticated-consumer header (which the handler can
  trust only if the direct `:8000` path is closed, else it is spoofable), or the
  handler must re-validate the JWT signature itself — which the functions do not
  do today. The cost and the security of this option turn entirely on that
  answer.
- **Network isolation.** Move the setup/cron-only functions off the public
  gateway entirely (internal-only invocation). Strongest boundary for
  `embed-seed`/`sync-listings`, but changes how `setup.sh` and `pg_cron` reach
  them.

Because the choice touches the shared Kong config and the auth model for a
patient-facing surface, raise it as a **Discussion** for cross-team input before
the design commits to a mechanism. Confirm the local-dev `localhost:8082` path
and the `pg_cron`/`setup.sh` callers against whichever mechanism is chosen.
The `--allow-read` scoping is coupled to the Deno base image's cache dir
(`/deno-dir` on `denoland/deno`); verify the container still starts before
merging.

— Security Engineer 🔒
