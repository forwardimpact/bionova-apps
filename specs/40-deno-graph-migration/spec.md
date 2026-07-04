# Spec 40 — Deno resolved-graph audit gate (esm.sh → `npm:` migration) — STUB

> **Status: stub.** Filed to give Spec 20 a real id to cite for its follow-on
> migration work. Not yet fleshed out; not up for approval. Spec 20 ships the
> honest stopgap (a version-pin advisory check on the top-level Deno pins); this
> spec is the durable graph gate Spec 20 explicitly defers as Out of scope.

**Classification:** Internal (CI/quality infrastructure). Structural — it changes
edge-function source (dependency specifiers), so it is a spec, not a mechanical
fix.

**Persona / job:** No direct persona. Same job as Spec 20 — it defends the
Clinical Development Staff job **Keep Listings True** (JTBD.md:35) by extending
advisory coverage of the Supabase edge functions from their top-level pins to
their full transitive dependency tree.

## Problem

Spec 20's Deno gate is a stopgap: it checks the **top-level pinned versions**
(`std@0.224.0`, `supabase-js@2.110.0`) against an advisory source keyed by
ecosystem + version. It cannot see the transitive tree, and no lockfile-graph
scanner can today, because:

- `import_map.json` imports `@supabase/supabase-js` as an `https://esm.sh/…`
  URL, not an `npm:` specifier. esm.sh and `std` URLs carry no landed PURL, so
  OSV has nothing to key a lookup on.
- `deno.lock` (v5) carries only `deno.land/std@0.224.0` hashes; supabase-js and
  its whole transitive tree are absent from the lockfile.
- OSV-Scanner ships no `deno.lock` extractor, so pointed at this tree it resolves
  to zero packages and reports a false green.

Closing this gap requires a **source migration**: move the four edge functions
from `esm.sh` URL specifiers to `npm:` specifiers so the resolved `deno.lock`
carries an auditable npm tree an OSV extractor can read. That has runtime
implications (esm.sh pre-bundled ESM vs Deno's `npm:` compat layer) and must be
verified against the deployed Supabase Edge runtime.

## Scope (to be detailed on approval)

**In scope (sketch):**

- Migrate the four edge functions' external imports to `npm:` specifiers.
- Verify the Supabase Edge runtime resolves and runs the `npm:`-specified tree
  identically to the current esm.sh imports (no behavior change).
- Replace Spec 20's version-pin stopgap with a resolved-graph OSV gate over the
  regenerated `deno.lock`.
- Retire the pins-only coverage-boundary note once graph coverage lands.

**Out of scope:**

- The npm/bun audit gate (PR #26) and the Spec 20 stopgap it supersedes here.

## Success criteria

_To be written when this spec is picked up for real. The headline intent: the
Deno edge-function transitive tree is scanned for critical/high advisories on
every PR and push to `main`, with no false-green, replacing the Spec 20 stopgap._

— Security Engineer 🔒
