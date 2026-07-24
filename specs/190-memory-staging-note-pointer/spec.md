# Spec 190 — A durable home for design/plan-input staging notes

**Classification:** Internal (agent-memory infrastructure), and constraint-lifting.
The product-vs-internal axis is per the work-definition rubric. Internal work
normally sits behind product work. The exception that keeps this ahead is
memory-protocol § On-Boot Routing: internal work that lifts a constraint on
product delivery. The constraint here is a degraded cross-agent boot-routing
surface. It throttles rather than hard-blocks every agent's spec/design/plan
cycle, and the exception holds because that surface sits on the critical path of
every product spec's design and plan step.

**Persona / job:** No direct persona. The job is internal: keep the agent team's
shared boot-routing surface legible. The product delivery it unblocks is the
throughput of the patient-facing specs whose staging notes crowd the table today
(e.g. Spec 60, Spec 70, issue #127), which serve the three JTBD personas —
Patient/Advocate, Clinical Development Staff, Referring Physician. Every one of
those specs' design and plan cycles depends on `wiki/MEMORY.md`, the one surface
every agent reads on boot, staying readable.

## Problem

Obstacle #187: `wiki/MEMORY.md`'s Cross-Cutting Priorities table accretes faster
than curation can trim it.

Evidence, pinned to the pre-trim snapshot of **2026-07-12** (the live table
drifts daily as agents write, so the counts below are dated, not current;
the pre-trim state is preserved in the wiki repo's git history):

- The memory-protocol § Cross-Cutting Priorities contract caps the table at
  **10 active rows**. It stood at **17**.
- **9 of the 17 rows (1069 words, over half the table body)** were
  `spec-NN design-input` / `plan-input` staging notes — inputs seated in advance
  for a future `kata-design` or `kata-plan` step.
- **Six of those nine already carried the words "full detail on `<agent>` W28
  log"** (the agent's week-28 weekly log) — the authoritative copy was already on
  the log, yet the MEMORY.md row had grown from a one-line pointer into a full
  duplicate.
- A verified curation pass (2026-07-12) removed the settled and duplicate rows a
  one-time trim can legitimately take, reaching **15 rows / 8 staging notes** —
  still over cap, and the safely-removable rows are now exhausted.

**Root cause: curation can only clear finished items, but staging notes are not
finished.** They persist — correctly — until their owning spec's design/plan
step consumes them, so they accrete faster than resolved items drain, and there
is no home for their detail except the shared table.

**Why it matters.** MEMORY.md exists for one job: cross-agent boot-routing
visibility. It is the single surface every agent reads on boot to learn what is
in flight and who owns it. Accretion past the cap degrades that read for every
agent, and the degradation compounds daily.

**This spec does not relieve the acute breach on a bounded timeline** — it is a
durable rule, not a re-trim. The count can stay over the 10-row cap for weeks
after adoption; what changes is that new notes stop re-accreting the overage.
The full statement, and why the criteria verify the convention's properties
rather than a rows-over-cap trajectory, is the non-goal under Scope.

## Scope

**In scope:**

| Component | What it does |
|---|---|
| In-repo staging-note convention | A team convention, in a durable git-tracked in-repo home (the exact location is the design's choice), defining where a `design-input`/`plan-input` staging note's detail lives and what the shared MEMORY.md surface carries for it. Adoptable now, without any upstream change |
| Bounded footprint | The convention states a quantified per-note maximum on the shared surface, so each note contributes a small fixed footprint rather than an open-ended essay |
| Delete-on-consume lifecycle | A staging note is created when seated and deleted from the shared surface when the owning spec's design/plan step consumes it — a lifecycle distinct from curation's trim-when-settled |
| Writer guidance | The convention updates writer-facing guidance so the rule is followed at write time by whoever seats a note |

**Out of scope — each with its home:**

| Excluded | Home |
|---|---|
| The authoritative memory-protocol contract **text** change — writing the convention's rule into the canonical contract. The in-repo convention above is the adoptable, non-blocking deliverable | Upstream in `forwardimpact/kata-skills`; tracked at **#272**. Why it cannot land in-repo is in Notes for design |
| `gemba-wiki inbox promote` writes a full row from a memo today; teaching it to emit a bounded note + park detail is upstream compiled-binary tooling | Upstream tooling; tracked at **#273**. The convention is usable with manual discipline meanwhile |
| Bulk backfill of the currently-seated staging notes | Not required — a seated note converts to the new schema only when its owning agent next writes to that row for another reason, or when the note is consumed; no separate backfill pass and no re-trim of the shared table under this arc |
| The genuinely cross-cutting infra/governance obstacles (the `gemba-wiki` hazards — STATUS.md corruption, push conservation — the APM race, exp governance) | Legitimately shared full rows, not staging notes; untouched |
| `technical-writer.md` own-summary bloat — a distinct own-summary surface over its own word budget, unrelated to the shared table | A separate cycle |

**Non-goals:**

- **Relieving the acute row-over-cap breach on any bounded timeline.** This spec
  neither re-trims the table nor schedules the drain of the notes seated today;
  they clear only as each owning spec consumes its note. Success is that new
  notes stop re-accreting the overage, not that the count returns under 10 by a
  date. The criteria verify the convention's properties, not a rows-over-cap
  trajectory.

**Constraints:**

- **Cross-agent visibility must not regress** — the load-bearing criterion, SC1.
- **No information loss** — a note's detail has a durable home before its
  shared-surface entry is compressed or moved.
- **Wiki write discipline** — achievable without `gemba-wiki fix` (the
  STATUS.md-corruption hazard) and within the conservation-guard push rules
  already documented in MEMORY.md.
- **Human-only approval; release-merge gate**, never an admin-merge.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | **(Load-bearing.)** Any multi-contributor staging note — one with at least one contributor who is not its Owner — written per the convention stays visible to every contributing agent from a single boot read | seating a representative multi-contributor test note per the convention (e.g. one carrying inputs from staff-engineer and security-engineer, with staff-engineer as Owner), then running `gemba-wiki boot --agent <self>` as each contributing agent: the note appears in the **non-Owner** contributor's (security-engineer's) `cross_cutting[]` array — not only in the Owner's `owned_priorities[]` — and no agent opens another agent's private surface. A mechanism that surfaces the note only in the Owner's `owned_priorities[]` fails |
| 2 | The convention states a quantified per-note maximum footprint for the shared surface | the convention document names a concrete per-note maximum — a specific line or word count — that a given entry can be checked against |
| 3 | A staging note's full detail resolves from its shared-surface entry with no loss | the convention includes a worked example whose shared-surface entry names a stable, durable location a reader follows to the full detail; the concrete pointer form is the design's choice |
| 4 | The convention defines the delete-on-consume lifecycle: a note is removed from the shared surface when its owning spec's design/plan step consumes it, distinct from curation's trim-when-settled | the convention document contrasts the two lifecycles so a reader can separate them: it names the delete-on-consume trigger (the owning spec's design/plan step consumes the note) **and** distinguishes it from curation's trim-when-settled trigger, such that a reader handed a specific note can decide which lifecycle applies and who removes the entry |
| 5 | The lifecycle is net-zero on the shared surface: a note seated then consumed per the convention leaves **no residual entry of any kind** — no stub pointer row, no blank table row, no orphan heading | seating a test note (its pointer resolving per SC3), then consuming it per the convention, and confirming the shared surface returns to its exact pre-seat state — verified by diffing the shared surface against its pre-seat snapshot and finding no residual stub pointer, blank row, or orphan heading. This is independent of the SC2 footprint unit: any structural residue fails, not only residue above the SC2 maximum |
| 6 | Writer-facing guidance is updated so whoever seats a note follows the rule | the convention document shows the updated writer guidance |
| 7 | The convention is usable today without any upstream tooling or contract-text change | seating and consuming a note per the convention succeeds over the current `gemba-wiki` / curation flow with no upstream dependency. **Fails if** any step requires an upstream tooling change or a contract-text edit — e.g. a `gemba-wiki` command exits non-zero, the `gemba-wiki push` conservation guard rejects the write, or the seated pointer cannot be resolved without an unreleased tool |

## Notes for design

- **The mechanism fork is the design's to resolve. SC1 is the deciding,
  load-bearing test any mechanism must pass** — it is deliberately
  discriminating, not mechanism-neutral. Two candidates, stated for the
  concurrence round; the facilitator's lean is non-binding input, not a spec
  decision:
  - **A** — a bounded entry stays on the shared MEMORY.md surface; detail moves
    to the owning agent's weekly log. Meets SC1 directly. Note the weekly log is
    append-only and rotates by part (memory-protocol § Weekly Log Contract), so
    delete-on-consume (SC4/SC5) removes the shared-surface entry, not the log
    copy — the detail persists on the log by design, which is the intended
    durable archive.
  - **B** — staging notes move to the off-budget Carry surface (memory-protocol
    § Carry Surface), which is one-file-per-agent, read at boot only for the
    owning agent via `Read`, and does not count against the 10-row cap. Plain B
    therefore fails SC1 — a co-contributor's boot never reads another agent's
    Carry file. A B-variant that restores cross-agent boot visibility clears the
    bar.

  Facilitator's recorded lean is A. If the concurrence round surfaces a B-variant
  that satisfies SC1, the design may take it.
- **Authoritative source, and why the contract text is out of scope.** The
  contract text lives upstream in `forwardimpact/kata-skills`, integrated into the
  gitignored `.claude/agents/memory-protocol.md` (via the `.claude/agents/` entry
  in `.gitignore`). A direct in-repo edit is overwritten on the next
  `apm install`, so the text amendment must land upstream and propagate on a pin
  bump — the #107/#111 channel — where a bot PR is not possible (403). Tracked at
  #272. The in-repo convention is the deliverable agents adopt now; the upstream
  text sync is the follow-up.
- **Concurrence round.** Route the pointer-schema to **staff-engineer**,
  **security-engineer**, **product-manager**, and **release-engineer** — the
  heaviest writers of staging rows — before the review panel closes. Approval
  stays human-only.
- **Follow-ups (filed):** (1) the upstream memory-protocol contract-text
  amendment — **#272** (sibling of kata-skills#3, staff-engineer's; distinct
  section of the same upstream repo, so tracked separately); (2) the
  `gemba-wiki inbox promote` bounded-note behavior — **#273** (sibling of #84,
  release-engineer's; same tool, distinct subcommand). Both land upstream (no bot
  PR); reference them from the design.
- **Do not re-trim the shared table** as part of this arc — the safe curation
  trim already shipped (17 → 15 rows), and no-re-trim is now a stated non-goal
  (see Scope). This spec is the durable rule that keeps the table from
  re-accreting; the existing backlog drains as each note is consumed.

— Technical Writer 📝
