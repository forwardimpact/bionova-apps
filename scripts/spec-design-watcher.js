#!/usr/bin/env node
// spec-design-watcher.js — compute the artifact-only design backlog and (with
// --record) append it to wiki/metrics/staff-engineer/2026.csv as an earned XmR
// point under the metric `specs_missing_design_artifact`.
//
// This is the ARTIFACT-ONLY backlog: every merged spec.md lacking a merged
// design-a.md, ungated by ledger approval state. It is DISTINCT from the
// approval-gated `specs_awaiting_design` instrument (specs at ledger `spec
// approved` lacking a design — the design-ELIGIBLE set), which the storyboard
// records by hand and which owns item-1's design-leg clock. Two names, two
// questions; do not co-mingle them under one series (facilitator ruling on
// exp #226 / obstacle #225 — gemba-xmr keys series by name across event_types,
// so only a distinct name unmixes the pipeline).
//
// A spec is "missing its design artifact" when all three hold:
//   1. its spec.md is merged (present on the source ref/root),
//   2. no design-a.md is merged for it, and
//   3. its wiki/STATUS.md row has not reached `design approved` or beyond
//      (plan draft/approved/implemented), and is not `cancelled`.
// A spec with no STATUS row at all still counts if 1 and 2 hold — a spec that
// merged without a design is exactly the backlog this gauge exists to surface.
// A `spec draft` spec counts too: it is ungated by approval (that is what makes
// this the artifact-only basis). exp:{issue} rows are ignored: not specs.
//
// The count is the falsifiable metric (see issue #23). Specs whose merge date is
// older than the two-day spec→design clock are also collected into `flagged` as
// a secondary annotation; flagging never changes the count.
//
// Sources:
//   --root=<dir>   read specs/ and wiki/STATUS.md from a plain directory tree
//                  (used by the fixture test; no git, deterministic).
//   default        read specs/ and design-a.md from a git ref (--ref, default
//                  origin/main) — only merged artifacts count — but read
//                  STATUS.md from the working-tree wiki/ checkout, which gemba-wiki
//                  hydrates from the nested wiki repo (bionova-apps.wiki). That
//                  wiki-repo copy is the single authoritative ledger the merge
//                  gate also reads; the app-repo blob at origin/main:wiki/STATUS.md
//                  was a stale shadow and is no longer tracked (issue #105).
//
// Modes:
//   --json         print the full result object and exit; never records.
//   --record       append the count to the staff-engineer metrics CSV via
//                  gemba-xmr. Without it the script only prints a summary.
//   --now=<iso>    override "now" for the two-day flag (default: today).
//
// Usage:
//   node scripts/spec-design-watcher.js               # summary off origin/main
//   node scripts/spec-design-watcher.js --record      # + record earned point
//   node scripts/spec-design-watcher.js --root=scripts/fixtures/specs-awaiting-design --json

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

// --- STATUS ledger parsing -------------------------------------------------

// Return the tab-separated rows inside the last fenced block of a STATUS.md
// body, each as an array of cells. Empty ledger -> [].
export function parseStatusRows(text) {
  if (!text) return [];
  const fences = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (fences.length === 0) return [];
  const body = fences[fences.length - 1][1];
  return body
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));
}

// Map spec id -> { phase, status } from ledger rows. exp: rows are skipped —
// they are keyed exp:{issue} and carry a different four-cell shape.
export function statusIndex(rows) {
  const index = new Map();
  for (const cells of rows) {
    const id = cells[0];
    if (!id || id.startsWith("exp:")) continue;
    index.set(id, { phase: cells[1] ?? "", status: cells[2] ?? "" });
  }
  return index;
}

// A ledger row that means "design is done or the spec left the awaiting pool".
function pastDesign(row) {
  if (!row) return false;
  if (row.status === "cancelled") return true;
  if (row.phase === "plan") return true; // plan draft/approved/implemented
  if (row.phase === "design" && row.status === "approved") return true;
  return false;
}

// --- Pure computation ------------------------------------------------------

// source shape: { specIds:string[], hasDesign(id):bool, statusText:string,
//                 mergedAt(id):Date|null }
export function computeSpecsMissingDesignArtifact(source, now = new Date()) {
  const index = statusIndex(parseStatusRows(source.statusText));
  const awaiting = [];
  const flagged = [];
  for (const id of source.specIds) {
    if (source.hasDesign(id)) continue;
    if (pastDesign(index.get(id))) continue;
    awaiting.push(id);
    const merged = source.mergedAt ? source.mergedAt(id) : null;
    if (merged && now.getTime() - merged.getTime() > TWO_DAYS_MS) flagged.push(id);
  }
  return { specsMissingDesignArtifact: awaiting.length, awaiting, flagged };
}

// --- Sources ---------------------------------------------------------------

// Filesystem source: a plain directory tree with specs/ and wiki/STATUS.md.
// An optional specs/<id>/merged_at file (ISO date) drives the two-day flag.
export function fsSource(root) {
  const specsDir = join(root, "specs");
  const specIds = existsSync(specsDir)
    ? readdirSync(specsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(specsDir, d.name, "spec.md")))
        .map((d) => d.name)
        .sort()
    : [];
  const statusPath = join(root, "wiki", "STATUS.md");
  return {
    specIds,
    hasDesign: (id) => existsSync(join(specsDir, id, "design-a.md")),
    statusText: existsSync(statusPath) ? readFileSync(statusPath, "utf8") : "",
    mergedAt: (id) => {
      const p = join(specsDir, id, "merged_at");
      if (!existsSync(p)) return null;
      const d = new Date(readFileSync(p, "utf8").trim());
      return Number.isNaN(d.getTime()) ? null : d;
    },
  };
}

// Git source: only artifacts merged into <ref> count. Enumerates specs/*/spec.md
// and design-a.md from the tree and reads merge dates from git — those are
// app-repo artifacts, so "merged into <ref>" is the right gate. STATUS.md is the
// approval ledger; its authoritative copy lives in the nested wiki repo, checked
// out by gemba-wiki into the working tree, so it is read from disk, not from <ref>
// (issue #105). An optional statusPath overrides the working-tree location (test).
export function gitSource(ref, statusPath) {
  const git = (args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let tree = "";
  try {
    tree = git(["ls-tree", "-r", "--name-only", ref]);
  } catch {
    tree = "";
  }
  const paths = tree.split("\n").filter(Boolean);
  const specIds = [
    ...new Set(
      paths
        .map((p) => p.match(/^specs\/([^/]+)\/spec\.md$/))
        .filter(Boolean)
        .map((m) => m[1]),
    ),
  ].sort();
  const designIds = new Set(
    paths
      .map((p) => p.match(/^specs\/([^/]+)\/design-a\.md$/))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  // Read STATUS.md from the working-tree wiki/ checkout (gemba-wiki-hydrated from
  // the wiki repo), not from `${ref}:wiki/STATUS.md`. Resolve it relative to the
  // git top-level so cwd does not matter; caller may override for tests.
  let statusText = "";
  try {
    let path = statusPath;
    if (!path) {
      const top = git(["rev-parse", "--show-toplevel"]).trim();
      path = join(top, "wiki", "STATUS.md");
    }
    statusText = existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    statusText = "";
  }
  return {
    specIds,
    hasDesign: (id) => designIds.has(id),
    statusText,
    mergedAt: (id) => {
      try {
        const iso = git([
          "log",
          "-1",
          "--format=%cI",
          ref,
          "--",
          `specs/${id}/spec.md`,
        ]).trim();
        if (!iso) return null;
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    },
  };
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { record: false, json: false, ref: "origin/main", root: null, now: null };
  for (const arg of argv) {
    if (arg === "--record") opts.record = true;
    else if (arg === "--json") opts.json = true;
    else if (arg.startsWith("--ref=")) opts.ref = arg.slice(6);
    else if (arg.startsWith("--root=")) opts.root = arg.slice(7);
    else if (arg.startsWith("--now=")) opts.now = new Date(arg.slice(6));
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const source = opts.root ? fsSource(opts.root) : gitSource(opts.ref);
  const now = opts.now ?? new Date();
  const result = computeSpecsMissingDesignArtifact(source, now);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const scope = opts.root ? `root ${opts.root}` : `ref ${opts.ref}`;
  console.log(`specs_missing_design_artifact = ${result.specsMissingDesignArtifact} (${scope})`);
  if (result.awaiting.length) console.log(`  awaiting: ${result.awaiting.join(", ")}`);
  if (result.flagged.length)
    console.log(`  past 2-day clock: ${result.flagged.join(", ")}`);

  if (opts.record) {
    const flagNote = result.flagged.length
      ? `; ${result.flagged.length} past 2-day clock (${result.flagged.join(",")})`
      : "";
    execFileSync(
      "npx",
      [
        "gemba-xmr",
        "record",
        "--skill=staff-engineer",
        "--metric=specs_missing_design_artifact",
        `--value=${result.specsMissingDesignArtifact}`,
        "--unit=count",
        `--note=spec→design artifact watcher @ ${opts.ref}${flagNote}`,
      ],
      { stdio: "inherit" },
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
