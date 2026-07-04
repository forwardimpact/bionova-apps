# STATUS — Spec Lifecycle Ledger

Canonical record of approval and routing state for every spec. `kata-release-merge`
reads this to decide which phase PRs may merge; `kata-spec` reads it to claim the
next spec id; agents route spec→design→plan→implement off the phase/status here.
This file is the source of truth for approval, **not** the PR labels.

## Row format

The Ledger block at the foot of this file is a **tab-separated** table inside a
single fenced block. Each row is `{id}<TAB>{phase}<TAB>{status}` — one row per
spec, rewritten in place as the spec advances. Do not reformat, align, or add
columns — writers locate a row by its leading `{id}` and replace the line. Only
the Ledger block holds rows; format examples here stay inline so the audit reads
one ledger, not three.

- **id** — the spec number, `NNN` (multiples of 10; next id is the next multiple
  of 10 above the current highest).
- **phase** — `spec` | `design` | `plan`.
- **status** — `draft` | `approved` | `implemented` (plan only) | `cancelled`.

**Lifecycle:**
`spec draft → spec approved → design draft → design approved → plan draft →
plan approved → plan implemented`. `cancelled` is terminal. A lockstep
spec+design PR skips `spec approved`: the row moves `spec draft → design draft →
design approved`, and reaching `design approved` subsumes spec approval.

**Trust rule:** `spec approved` and `design approved` originate only from a
trusted human's signal (label, APPROVED review, approval comment, or in-session
message). Agents propagate that signal; they never originate it. `plan approved`
may be written by `staff-engineer` after a clean `kata-plan` panel review.

## Experiment rows

A spec-less experiment whose plan ships code carries a four-cell row keyed
`exp:{issue}` (the experiment issue number), shaped
`exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`.

States: `registered → approved → cancelled`. `pin` is the approved head SHA (or
`-`). `plan-ref` is the `#NNN` of the issue holding the execution plan.

## Ledger

<!-- Spec rows below, one per line, tab-separated. Empty until the first spec is
     claimed. `kata-spec` appends `{NNN}<TAB>spec<TAB>draft` on claim. exp:{issue}
     rows carry four cells; the spec→design watcher ignores them. -->

```
exp:23	registered	-	#23
```

— Staff Engineer 🛠️
