# Spec 90 — HTTP security response headers for the Polaris patient site

**Classification:** Internal (defense-in-depth infrastructure). It hardens the
patient-facing web surface against browser-side attacks; it ships no new product
behavior.

**Persona / job:** Defends the **Patient / Advocate** job *Find a Relevant
Trial* (JTBD.md). A patient browses trials and runs the eligibility screener in
the browser; these headers protect that session from clickjacking, MIME
confusion, and referrer leakage of the trial ids they are viewing.

## Problem

The Polaris patient site (`products/polaris/site`) sends no HTTP security
response headers. Its Next.js config declares no `headers()` function, so every
response ships with browser protections off. Found in the 2026-07-06
`app-security-products` security audit; the audit found no high/critical
app-security issue, and this is its one structural finding.

Absent on every route and page:

| Missing header | Attack it leaves open |
|---|---|
| `X-Frame-Options` / CSP `frame-ancestors` | Clickjacking: the site can be framed by any origin and UI-redressed |
| `X-Content-Type-Options: nosniff` | MIME sniffing: a response can be reinterpreted as an executable type |
| `Referrer-Policy` | Referrer leakage: full URLs, including the trial id a patient is viewing, leak to third-party origins |
| `Permissions-Policy` | Powerful browser features (camera, geolocation) are not denied by default |
| `Content-Security-Policy` | No script/style allowlist, so a single injection has no second line of defense |
| `Strict-Transport-Security` | See the HSTS note below; the correct layer is the edge proxy, not the app |

The app renders a synthetic-data domain (`data/synthetic/story.dsl`) and the
screener records only yes/no answers to synthetic criteria, so there is no real
PHI at stake. Severity is **Low**: React escaping already blocks reflected XSS
and no `dangerouslySetInnerHTML` exists anywhere in the site. The gap matters
because it removes the layer that would contain a future mistake on a
patient-facing surface.

**Why this is a spec and not one mechanical edit.** Four of the six headers
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`) are static one-liners with no design content and could
ship immediately. The two that carry a real decision are what make this a spec:

- **Content-Security-Policy** must be reconciled against what the site actually
  loads. Data fetching is server-side and the screener submits through a native
  form POST, so the browser never connects to Supabase and `connect-src 'self'`
  is expected to suffice; the open questions are `style-src` (Tailwind and any
  Next runtime style injection) and a `report-only` → `enforce` rollout so a
  too-strict policy does not break the patient surface.
- **HSTS** is a deployment decision, not an app one. TLS terminates at the
  Railway edge proxy and the Next container serves plaintext, so an app-layer
  `Strict-Transport-Security` header is at best a no-op and at worst harmful
  (`includeSubDomains`/`preload` on a shared edge domain). The decision this
  spec must record is where HSTS belongs and whether the app sets it at all.

The header set also lands in `next.config.mjs`. Spec 50 (`next` 14→15) is
approved but not yet implemented and its design also edits that file, so the two
must be sequenced to avoid a merge collision.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| Static security headers | The site sends `X-Frame-Options` (or CSP `frame-ancestors`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` on every response |
| Content-Security-Policy | The site sends a CSP that allowlists exactly the sources the patient surface loads, with a documented `report-only` → `enforce` rollout |
| HSTS decision | A recorded decision on whether HSTS is set at the app layer or the Railway edge, with its TLS-termination assumption stated |
| Verification hook | A check (smoke or test) that asserts the required headers are present on a named route, so the protection cannot silently regress |

**Out of scope:**

| Excluded | Why |
|---|---|
| Edge functions / Kong response headers (`services/`) | Different surface; the edge-function authz work is spec 80 (PR #81) |
| The `next` 14→15 bump itself | Owned by Spec 50; this spec sequences after / alongside it on `next.config.mjs` (see Dependencies) |
| A nonce-based strict CSP for inline scripts | Deferred: pursue only if the App Router requires inline script the allowlist cannot cover; the design decides |
| A hosted CSP violation report sink | On this stack `report-only` is validated in the browser console, not against a collector endpoint |

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The four static headers are present on a page response and on a named `/api/*` GET | `curl -sD- -o /dev/null <route>` shows each header on the page and the api route |
| 2 | A CSP header is present and the patient surface (search, trial detail, eligibility screener) renders and functions under it | `just smoke` / e2e passes with CSP active |
| 3 | The design records the CSP source-allowlist rationale and the `report-only` → `enforce` step (documentation gate) | The shipped CSP header string enumerates each allowlisted source named in the design |
| 4 | The design records the HSTS decision and its TLS-termination assumption (documentation gate) | Present in the design |
| 5 | A regression check fails if a required header is removed | The added test/smoke assertion fails when a header is dropped |

## Dependencies

- **Spec 50 (`next` 14→15)** — approved, not yet implemented; its design also
  edits `next.config.mjs`. This spec sequences after Spec 50 merges, or is
  coordinated into it, so the two `next.config.mjs` edits do not collide.

— Security Engineer 🔒
