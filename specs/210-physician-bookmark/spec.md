# Spec 210: Bookmark and revisit a collection of trials

**Classification:** Product — serves the Referring Physician persona's in-visit
referral job; adds a patient-facing/physician-facing capability (saving trials
to revisit), not internal tooling.

**Persona / job:** Referring Physician — *Refer in the Visit* (Big Hire): *"Help
me search trials on behalf of patients and share the details,"* and its Little
Hire: *"Help me bookmark a trial and hand the patient something they
understand."* ([JTBD.md](../../JTBD.md))

## Problem

The Little Hire names two verbs — **bookmark** and **hand over something
plain-language**. [Spec 60](../60-shareable-trial-summary/spec.md) serves the
second: it defines a shareable, plain-language summary the physician can hand a
patient. Spec 60 explicitly defers the first (its X2): *"the 'bookmark' half is
a separate spec once a persistence surface exists."* This spec is that half.

Today the physician cannot save a trial. The word "bookmark" appears exactly
once in the product — as persona prose in
[`products/polaris/README.md`](../../products/polaris/README.md) ("search on
behalf of patients, bookmark and share trial details"). There is no bookmark
command, route, stored collection, or any surface that lets a physician mark a
trial and return to it. Every demand-side surface is stateless: `search` and the
`trial` detail view render from `data/synthetic/story.dsl` and remember nothing
between invocations.

The one write path that does exist — the anonymous interest-signal insert behind
the eligibility check — is fire-and-forget: it records that *interest happened*,
and nothing reads it back to a physician as *the trials I saved*. So there is no
retrievable collection anywhere.

The cost lands on the job's forces:

| Force (JTBD.md) | How the missing bookmark hurts |
| --- | --- |
| **Habit** — *"Referring only to the handful of trials I already know."* | A physician who finds a fitting trial mid-visit cannot save it. Next visit they start from `search` again, so the fastest path stays the handful already memorized. The absence actively reinforces the habit the job is trying to break. |
| **Push** — *"No time to parse a protocol mid-visit."* | With three minutes left, re-finding a trial seen last week means re-running and re-scanning search results. There is no "the ones I set aside" shortcut. |
| **Trigger** — *a patient asks whether any trial fits, three minutes left.* | The physician cannot prepare a short list ahead of the visit and pull it up when the patient asks. |

The trial content to bookmark already exists and is addressable — every trial
has a stable id (e.g. `oncora-phase3`) that `search` and `trial` already use.
What is missing is a surface that lets a physician *mark* a trial by that id and
*retrieve the marked set* later.

## Scope

This spec defines a **bookmark capability**: a physician can add a trial to a
personal collection, see the collection, and remove a trial from it, across the
demand-side surfaces where trials are shown (CLI and site). It is additive —
no existing view changes.

**The persistence invariant, not the persistence mechanism.** Polaris's patient-
and physician-facing surfaces (`search`, the `trial` view) have no user accounts
and no login — the only authenticated surface is the staff admin console, which
is out of scope here. A bookmark must therefore persist **without an account**
and must survive across separate invocations for the same physician. *How* the
collection persists — a link- or token-encoded collection the physician keeps,
surface-local storage, or a server-stored collection addressed by an unguessable
id — is a design decision. This spec fixes the invariants the mechanism must satisfy
(below and in success criteria); the design chooses among them.

**A bookmark stores references, never domain content.** A saved collection holds
only trial identifiers that resolve against the seeded trial catalog (whose
source of record is `data/synthetic/story.dsl`) at read time. It never copies or
caches trial prose, criteria, or any domain field. This
keeps `story.dsl` the single source of record (CLAUDE.md,
[PROVENANCE.md](../../data/synthetic/PROVENANCE.md)) — a bookmark that named a
stale trial resolves against live content or reports the trial is no longer
present, and never becomes a second, drifting copy.

In scope:

| # | The bookmark capability will… |
| --- | --- |
| S1 | Let a physician **add the trial currently shown to their collection** from the surfaces where a trial is shown (at minimum the CLI and the site trial view), and report success. The saved reference is the trial's stable id (S5); the physician acts on the trial in front of them, not by typing an id. |
| S2 | Let a physician **view their collection** — the set of saved trials, each identified enough to recognize it (at minimum the trial name). |
| S3 | Let a physician **remove a trial** from their collection, and report the trial is no longer saved. |
| S4 | **Persist the collection without an account**, so a physician who adds trials in one invocation sees the same set in a later invocation — given whatever reference the add returns (nothing, a token, or a link) — with no sign-in step. |
| S5 | Store **only trial references**; resolve each saved trial's displayed content from the seeded trial catalog (source of record `data/synthetic/story.dsl`) at read time, so a collection never holds a copy of domain content. |
| S6 | Handle a **saved trial that no longer resolves** (its id is absent from the current seed) by reporting it as unavailable, not by rendering stale or empty content and not by failing the whole collection view. |
| S7 | Treat adding an already-saved trial as a **no-op that still reports saved** (idempotent add), so a physician never creates duplicates or sees an error for re-saving. |

Explicitly excluded:

| # | Out of scope | Why |
| --- | --- | --- |
| X1 | The shareable plain-language summary. | Delivered by [Spec 60](../60-shareable-trial-summary/spec.md). This spec is the *collect/save* half; that spec is the *hand-over* half. A bookmarked trial may later be summarized via spec 60, but composing the two is a follow-on. |
| X2 | User accounts, authentication, or identity. | Polaris has no login and this spec does not add one; persistence is account-free (S4). Introducing accounts is a much larger, separate change. |
| X3 | Automatic sync of a collection across devices or between people — a collection appearing on a second device with no reference carried over. | The collection is one physician's working set; whether a physician can carry it to another surface via a saved reference (a token or link) is the mechanism's call (S4). A shared or auto-synced-across-devices collection is a separate job. |
| X4 | Bookmarking anything other than a trial (sites, conditions, searches). | The job names bookmarking *a trial*. Other targets are out of scope. |
| X5 | Storing any trial domain content in the collection. | Violates the single-source-of-record invariant (S5); the collection holds ids only. |
| X6 | The Patient / Advocate and Clinical Development Staff jobs. | This spec serves the Referring Physician job only. |
| X7 | Delivery channels for the collection (email, print, export). | Same boundary spec 60 draws for the summary (its X1); how a collection travels is a follow-on. |

## Success criteria

Each is a claim plus the command or path that verifies it. Automated tests are
the primary verifiers, exercising the seeded trial `oncora-phase3`. Which layer
hosts each assertion, and the persistence mechanism each exercises, are design
decisions.

| # | Claim | Verified by |
| --- | --- | --- |
| C1 | Adding `oncora-phase3` to an empty collection, then viewing the collection, returns a set containing that trial, identified by its trial name. | A test that adds the trial, reads the collection back, and asserts the saved trial is present and shows its name. |
| C2 | The collection persists across separate invocations with no sign-in: a second read — given whatever reference the add step returned to the physician (nothing, a token, or a link), after the session that added the trial has ended — returns the same saved set. | A test (or scripted CLI/site sequence) that adds in one invocation and reads in a distinct later one using only the add step's returned reference, asserting the set is unchanged and no authentication step was required. |
| C3 | Removing `oncora-phase3` from a collection that contains it leaves a collection that does not contain it, and reports the removal. | A test that adds then removes the trial and asserts it is absent from the subsequent collection read. |
| C4 | Adding `oncora-phase3` twice yields a collection containing it exactly once, and the second add reports saved rather than erroring. | A test that adds the same trial twice and asserts a single entry and a success (not error) response on the second add. |
| C5 | The stored collection contains only trial identifiers — no trial name, prose, criteria, or other domain field is written into it; displayed fields are resolved from the seeded trial catalog (source of record `data/synthetic/story.dsl`) at read time. | A test asserting the persisted collection payload holds only id-shaped references, plus `rg` over the collection's stored form finding none of `oncora-phase3`'s name, consent, FAQ, or `custom[]` strings. |
| C6 | A collection holding an id absent from the current seed reports that trial as unavailable and still renders the remaining valid trials. | A test seeding a collection with one valid id and one absent id, asserting the valid trial renders and the absent one is reported unavailable without failing the view. |

— Product Manager 🌱
