#!/usr/bin/env node
// CI dependency-audit gate for issue #22.
//
// Runs `bun audit --json` and compares the current critical/high advisories
// against a committed baseline (security/audit-baseline.json). CI fails ONLY on
// critical/high advisories that are NOT in the baseline — a newly introduced
// one. The known set does not block. Moderate/low advisories are reported for
// visibility but never gate.
//
// `bun audit` exits non-zero whenever any advisory exists, so this script gates
// on its own baseline diff and ignores bun's exit code.
//
// Baseline update rules (see security/audit-baseline.json):
//   - RESOLVED: a dependency bump drops the advisory from the live audit. The
//     gate stays green; remove the now-stale baseline entry in the same PR
//     (this script prints a non-fatal STALE warning to prompt it).
//   - ACCEPTED: a new critical/high we will not fix yet is added to the baseline
//     with a `reason` and `accepted_on` date, under security-engineer review.
//     Acceptance is always explicit, dated, and reviewed — never silent.
//
// Testability: set AUDIT_JSON_FILE=<path> to feed a captured `bun audit --json`
// document instead of invoking bun (used by scripts/audit-gate.test.mjs).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GATED = new Set(["critical", "high"]);
const baselinePath = process.argv[2] || "security/audit-baseline.json";

function loadAuditJson() {
  const fixture = process.env.AUDIT_JSON_FILE;
  if (fixture) return JSON.parse(readFileSync(fixture, "utf8"));
  let out;
  try {
    // bun audit exits non-zero when advisories exist; capture stdout regardless.
    out = execFileSync("bun", ["audit", "--json"], { encoding: "utf8" });
  } catch (err) {
    out = err.stdout?.toString() ?? "";
  }
  if (!out.trim()) return {};
  return JSON.parse(out);
}

// bun audit --json is keyed by package name -> array of advisory objects.
// Flatten into a map of GHSA id -> advisory, deduped across packages.
function flatten(auditJson) {
  const advisories = new Map();
  for (const [pkg, advs] of Object.entries(auditJson)) {
    if (!Array.isArray(advs)) continue;
    for (const a of advs) {
      const ghsa = String(a.url ?? "").split("/").pop() || `id-${a.id}`;
      if (!advisories.has(ghsa)) {
        advisories.set(ghsa, { ghsa, package: pkg, severity: a.severity, title: a.title, url: a.url });
      }
    }
  }
  return advisories;
}

const auditJson = loadAuditJson();
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineIds = new Set(Object.keys(baseline.advisories ?? {}));

const advisories = flatten(auditJson);
const bySeverity = { critical: [], high: [], moderate: [], low: [], other: [] };
for (const a of advisories.values()) {
  (bySeverity[a.severity] ?? bySeverity.other).push(a);
}

const gatedNow = [...advisories.values()].filter((a) => GATED.has(a.severity));
const introduced = gatedNow.filter((a) => !baselineIds.has(a.ghsa));
const gatedIds = new Set(gatedNow.map((a) => a.ghsa));
const stale = [...baselineIds].filter((id) => !gatedIds.has(id));

const line = "─".repeat(64);
console.log(line);
console.log("dependency-audit gate — issue #22 (threshold: critical + high)");
console.log(line);
console.log(
  `live advisories: ${advisories.size} total ` +
    `(critical ${bySeverity.critical.length}, high ${bySeverity.high.length}, ` +
    `moderate ${bySeverity.moderate.length}, low ${bySeverity.low.length})`,
);
console.log(`baselined critical/high: ${baselineIds.size}`);
console.log("");

// Moderate/low: report-only, never blocks (faithful to #22's crit/high scope).
const reportOnly = [...bySeverity.moderate, ...bySeverity.low];
if (reportOnly.length) {
  console.log(`report-only (moderate/low, not gated): ${reportOnly.length}`);
  for (const a of reportOnly) console.log(`  · ${a.severity.padEnd(8)} ${a.package} — ${a.ghsa}`);
  console.log("");
}

if (stale.length) {
  console.log(`⚠ stale baseline entries (resolved in live audit — remove them):`);
  for (const id of stale) console.log(`  · ${id} (${baseline.advisories[id]?.package ?? "?"})`);
  console.log("");
}

if (introduced.length) {
  console.log(`✗ FAIL: ${introduced.length} new critical/high advisory(ies) not in the baseline:`);
  for (const a of introduced) {
    console.log(`  · ${a.severity.toUpperCase()} ${a.package} — ${a.ghsa}`);
    console.log(`      ${a.title}`);
    console.log(`      ${a.url}`);
  }
  console.log("");
  console.log("Resolve it (bump the dependency) or, if it must be accepted for now,");
  console.log(`add its GHSA id to ${baselinePath} with a reason + accepted_on date`);
  console.log("under security-engineer review, then re-run.");
  process.exit(1);
}

console.log("✓ PASS: no new critical/high advisories beyond the baseline.");
process.exit(0);
