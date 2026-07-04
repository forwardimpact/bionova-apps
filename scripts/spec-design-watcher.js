#!/usr/bin/env node
// spec-design-watcher.js — compute specs_awaiting_design and (with --record)
// append it to wiki/metrics/staff-engineer/2026.csv as an earned XmR point.
//
// A spec is "awaiting design" when all three hold:
//   1. its spec.md is merged (present on the source ref/root),
//   2. no design-a.md is merged for it, and
//   3. its wiki/STATUS.md row has not reached `design approved` or beyond
//      (plan draft/approved/implemented), and is not `cancelled`.
// A spec with no STATUS row at all still counts if 1 and 2 hold — an approved
// spec that merged without a design is exactly the backlog this gauge exists to
// surface. exp:{issue} rows are ignored: they are not specs.
//
// The count is the falsifiable metric (see issue #23). Specs whose merge date is
// older than the two-day spec→design clock are also collected into `flagged` as
// a secondary annotation; flagging never changes the count.
//
// Sources:
//   --root=<dir>   read specs/ and wiki/STATUS.md from a plain directory tree
//                  (used by the fixture test; no git, deterministic).
//   default        read specs/ and wiki/STATUS.md from a git ref (--ref, default
//                  origin/main) — only merged artifacts count.
//
// Modes:
//   --json         print the full result object and exit; never records.
//   --record       append the count to the staff-engineer metrics CSV via
//                  fit-xmr. Without it the script only prints a summary.
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
export function computeSpecsAwaitingDesign(source, now = new Date()) {
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
  return { specsAwaitingDesign: awaiting.length, awaiting, flagged };
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
// and design-a.md from the tree, reads STATUS.md and merge dates from git.
export function gitSource(ref) {
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
  let statusText = "";
  try {
    statusText = git(["show", `${ref}:wiki/STATUS.md`]);
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
  const result = computeSpecsAwaitingDesign(source, now);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const scope = opts.root ? `root ${opts.root}` : `ref ${opts.ref}`;
  console.log(`specs_awaiting_design = ${result.specsAwaitingDesign} (${scope})`);
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
        "fit-xmr",
        "record",
        "--skill=staff-engineer",
        "--metric=specs_awaiting_design",
        `--value=${result.specsAwaitingDesign}`,
        "--unit=count",
        `--note=spec→design watcher @ ${opts.ref}${flagNote}`,
      ],
      { stdio: "inherit" },
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
