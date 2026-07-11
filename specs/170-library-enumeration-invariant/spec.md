# Spec 170: Cross-file consumed-library enumeration invariant

**Classification:** internal — repository enforcement tooling. Serves no JTBD
persona directly; it protects the accuracy of the contributor-facing orientation
docs (README, MONOREPO, CLAUDE) that every persona's contributors read first.

## Problem

Polaris restates its consumed Forward Impact shared-library set — the
`@forwardimpact/lib*` packages — as a canonical enumeration in three
root orientation docs:

| File | Where | Purpose |
| --- | --- | --- |
| `README.md` | the "consuming Forward Impact libraries" sentence | external-contributor orientation |
| `MONOREPO.md` | the "consumes Forward Impact libraries from npm" sentence | directory-shape reference |
| `CLAUDE.md` | the "consuming Forward Impact shared libraries" sentence | agent project instructions |

Each of these presents the set as an explicit backticked, comma-separated list.
Other files (`products/polaris/README.md`, `products/polaris/cli/README.md`,
`PROVENANCE.md`) mention individual libraries incidentally in prose but do not
present the set as an enumeration; they are deliberately out of scope so the
rule governs the one place the set is stated to be complete.

Nothing enforces that these three lists agree with the set the workspaces
actually depend on. The enumeration has drifted twice:

- **PR #97** corrected `CLAUDE.md` to add the omitted `libutil`.
- **PR #184** (in flight on `fix/doc-root-orientation-2026-07-11`) corrects the
  same `libutil` omission in `README.md` and `MONOREPO.md`.

As of this spec on `main`, `README.md` and `MONOREPO.md` still list five libs
and omit `libutil`, while `CLAUDE.md` lists six. Each correction has been a
manual catch by the docs lane after the drift already landed. The
`.coaligned/invariants/` directory holds only a `README.md` scaffold — no
`*.rules.mjs` module — so the "value that must agree across files" shape the
Co-Aligned invariant check is built for is currently unguarded.

This is the exact recurring-manual-fix signature that an invariant retires.

## Canonical consumed set

The rule needs one authoritative definition of the consumed set. The naive
choice — `products/polaris/cli/package.json` prod deps — is **wrong**: `libui`
is a `site/` dependency and `libtemplate` also appears in `handlers/`, so a
cli-only source would flag `libui` as an error in all three docs. The correct
canonical set is the **union of `@forwardimpact/lib*` production dependencies
across the product workspace manifests** — the `products/*/cli`,
`products/*/site`, and `products/*/handlers` `package.json` files enumerated by
the root `package.json` `workspaces` globs.

Two boundaries follow from that definition rather than needing a carve-out:

- The root `package.json` is **not** a source. Its only `@forwardimpact/lib*`
  entry is `libcoaligned`, a `devDependency` that runs the checks themselves;
  drawing only from product-workspace `dependencies` excludes it automatically.
- `services/polaris-functions` is a Deno unit with `deno.json` and **no**
  `package.json`, so it contributes nothing and is not a manifest source. The
  set is product-workspace-only.

Under that definition the set today is exactly:

| Library | Declared in |
| --- | --- |
| `libcli` | `products/polaris/cli` |
| `librepl` | `products/polaris/cli` |
| `libutil` | `products/polaris/cli` |
| `libformat` | `products/polaris/cli`, `products/polaris/site` |
| `libtemplate` | `products/polaris/cli`, `products/polaris/handlers` |
| `libui` | `products/polaris/site` |

Six libraries: `{libcli, librepl, libformat, libtemplate, libutil, libui}`.
`CLAUDE.md` matches this set; `README.md` and `MONOREPO.md` do not (pending
#184).

## Proposed change

Author the first `.coaligned/invariants/*.rules.mjs` module. The module asserts
that the `@forwardimpact/lib*` enumeration in each of the three orientation docs
equals the canonical consumed set defined above. When any doc omits a consumed
library or names one no workspace consumes, the check fails and names the
offending file and the specific library difference. (Because each doc is checked
against the one canonical set, cross-doc agreement follows transitively — it is
not a separate condition.)

Two identity rules the enumeration must honor, both WHAT the rule enforces:

- **Prefix-agnostic identity.** The docs write names inconsistently — `README.md`
  and `CLAUDE.md` use bare `libX`, while `MONOREPO.md` scopes the first entry as
  `@forwardimpact/libcli` then drops the scope on the rest. The manifest keys are
  always scoped. `libX` and `@forwardimpact/libX` denote the same library and
  compare equal.
- **File-scoped enumeration.** The rule reads only the single backticked,
  comma-separated library list in each of the three named files, not every
  incidental `lib*` mention. This keeps unrelated names (`libcoaligned`,
  `libterrain`, prose like "a libcli CLI") from being read as members.

The rule derives the canonical set from the product-workspace manifests at check
time, so adding or dropping a consumed library updates the expected set
automatically — the docs, not the rule, are what must be kept in step.

No CI wiring is added: `check-context.yml` already runs `bun run coaligned` on
every push and pull request, and that suite discovers and runs every module in
`.coaligned/invariants/`. Landing the module is sufficient for enforcement.

## Scope

**In scope:**

- One `*.rules.mjs` module in `.coaligned/invariants/` enforcing the
  cross-file library enumeration against the canonical set.
- The canonical-set definition as stated above (union of prod deps across the
  product workspace manifests; root manifest and Deno services are not sources).

**Out of scope:**

- Correcting the current `README.md`/`MONOREPO.md` drift — PR #184 owns that.
- Version-string agreement (the pinned versions in the manifests). This rule
  governs the library *set*, not its versions.
- The patient-string invariant the scaffold README suggests as a candidate —
  a separate, larger rule left for its own spec.
- Any change to the three docs' prose beyond the enumeration itself.

## Constraint: merge ordering

The module must not land on `main` before PR #184 merges. `check-context.yml`
runs `bun run coaligned` on every push and pull request, so a module that fails
against the current `main` (where `README.md`/`MONOREPO.md` still omit `libutil`)
would red-bar CI for every unrelated PR until the docs are corrected. This is a
hard sequencing constraint, not a preference: land #184 first, or land the doc
correction inside the same change that adds the module.

## Success criteria

Criteria assume the docs agree with the canonical set — that state exists on the
PR #184 branch today and on `main` once #184 merges (see § Constraint).

| # | Criterion | Verification |
| --- | --- | --- |
| SC1 | The enumeration rule module for this spec exists in `.coaligned/invariants/`. | The rule's `*.rules.mjs` file is present in `.coaligned/invariants/` |
| SC2 | `npx coaligned invariants` discovers and runs the module (no "no modules found" error). | `npx coaligned invariants` exits without the discovery error |
| SC3 | With the three docs agreeing with the canonical set, the check passes. | On a tree where all three docs list the canonical set, `npx coaligned invariants` reports the rule passing |
| SC4 | When a doc omits a consumed library, the check fails and names the file and the missing library. | Removing `libutil` from `CLAUDE.md` makes `npx coaligned invariants` fail with output naming `CLAUDE.md` and `libutil` |
| SC5 | When a doc names a library no workspace consumes, the check fails and names the file and the stray library. | Adding a fictional `libbogus` to `README.md` makes the check fail naming `README.md` and `libbogus` |
| SC6 | The expected set tracks the product workspace manifests, so a newly-consumed library must appear in the docs without any edit to the rule. | Adding an `@forwardimpact/lib*` prod dep to a product workspace manifest, with no change to the rule module, makes the (now-lagging) docs fail the check |
| SC7 | The full `bun run coaligned` suite runs the module, so CI enforces it with no workflow change. | `bun run coaligned` exercises the rule; `.github/workflows/check-context.yml` is unmodified |
