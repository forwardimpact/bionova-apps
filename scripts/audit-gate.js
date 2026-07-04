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
// FAIL-OPEN on infrastructure errors. `bun audit` queries the registry advisory
// database over the network. If that lookup errors (DB unreachable, rate limit),
// this gate emits a ::warning:: and exits 0 — a registry outage must never turn a
// required check into an all-PRs-blocked event. It fails closed (exit 1) ONLY on
// a real unbaselined critical/high finding.
//
// DETERMINISTIC. Advisory identity is the GHSA id; the diff is set-based and all
// printed lists are sorted (severity, then id), so the verdict never flips on
// bun's output ordering.
//
// Baseline update rules (see security/audit-baseline.json):
//   - RESOLVED: a dependency bump drops the advisory from the live audit. The
//     gate stays green; remove the now-stale baseline entry in the same PR
//     (this script prints a non-fatal STALE warning to prompt it).
//   - ACCEPTED: a new critical/high we will not fix yet is added to the baseline
//     with a `reason`, an `accepted_on` date, a `review_by` date, and a
//     `tracking` ref, under security-engineer review. Acceptance is always
//     explicit, dated, tracked, and reviewed — never silent.
//   - PAST-DUE: a still-live baselined advisory whose `review_by` has passed
//     gets a non-fatal ::warning:: every run, so a deferred acceptance cannot
//     sit invisible (the failure mode behind issue #16). Never blocks on a date.
//
// Testability: set AUDIT_JSON_FILE=<path> to feed a captured `bun audit --json`
// document instead of invoking bun (used by scripts/audit-gate.test.js). An
// empty or unparseable fixture exercises the fail-open path.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GATED = new Set(["critical", "high"]);
const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3, other: 4 };
const baselinePath = process.argv[2] || "security/audit-baseline.json";

// Returns { ok: true, data } with a parsed audit document, or { ok: false,
// reason } when the advisory service could not be reached / gave no usable
// output. Callers fail open on { ok: false }.
function loadAuditJson() {
  const fixture = process.env.AUDIT_JSON_FILE;
  let out;
  if (fixture) {
    out = readFileSync(fixture, "utf8");
  } else {
    try {
      out = execFileSync("bun", ["audit", "--json"], { encoding: "utf8" });
    } catch (err) {
      // bun audit exits non-zero BOTH when advisories exist (normal — stdout is
      // still valid JSON) and on a registry/network error (no usable stdout).
      // Distinguish the two below by whether the captured output parses.
      out = err.stdout?.toString() ?? "";
    }
  }
  const trimmed = (out ?? "").trim();
  if (!trimmed) return { ok: false, reason: "advisory audit produced no output (service unreachable?)" };
  try {
    return { ok: true, data: JSON.parse(trimmed) };
  } catch {
    return { ok: false, reason: "advisory audit output was not valid JSON (service error?)" };
  }
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

// Stable ordering for reproducible logs: severity first, then GHSA id.
function bySeverityThenId(a, b) {
  const s = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
  return s !== 0 ? s : a.ghsa.localeCompare(b.ghsa);
}

const line = "─".repeat(64);
console.log(line);
console.log("dependency-audit gate — issue #22 (threshold: critical + high)");
console.log(line);

const audit = loadAuditJson();
if (!audit.ok) {
  // Fail open: a registry outage must not block merges. Surface it loudly.
  console.log(`::warning::dependency-audit gate could not run — ${audit.reason} Not blocking (fail-open on infrastructure error).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baselineIds = new Set(Object.keys(baseline.advisories ?? {}));

const advisories = flatten(audit.data);
const bySeverity = { critical: [], high: [], moderate: [], low: [], other: [] };
for (const a of advisories.values()) {
  (bySeverity[a.severity] ?? bySeverity.other).push(a);
}

const gatedNow = [...advisories.values()].filter((a) => GATED.has(a.severity));
const gatedIds = new Set(gatedNow.map((a) => a.ghsa));
const introduced = gatedNow.filter((a) => !baselineIds.has(a.ghsa)).sort(bySeverityThenId);
const stale = [...baselineIds].filter((id) => !gatedIds.has(id)).sort();
const reportOnly = [...bySeverity.moderate, ...bySeverity.low].sort(bySeverityThenId);

console.log(
  `live advisories: ${advisories.size} total ` +
    `(critical ${bySeverity.critical.length}, high ${bySeverity.high.length}, ` +
    `moderate ${bySeverity.moderate.length}, low ${bySeverity.low.length})`,
);
console.log(`baselined critical/high: ${baselineIds.size}`);
console.log("");

// Moderate/low: report-only, never blocks (faithful to #22's crit/high scope).
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

// Past-due acceptances: a baselined advisory still live in the audit whose
// review_by date has passed. NON-FATAL — a required check must not flip red on
// a calendar date alone — but it nags loudly (::warning::) so an accepted
// critical/high cannot sit deferred and invisible. That silent, pressure-free
// accrual is the exact failure mode that produced issue #16; the gate must not
// recreate it one layer up. Override "now" via AUDIT_NOW for deterministic tests.
const now = process.env.AUDIT_NOW ? new Date(process.env.AUDIT_NOW) : new Date();
const pastDue = [...baselineIds]
  .filter((id) => gatedIds.has(id)) // still present in the live audit
  .map((id) => ({ id, entry: baseline.advisories[id] ?? {} }))
  .filter(({ entry }) => entry.review_by && new Date(entry.review_by) < now)
  .sort((a, b) => a.id.localeCompare(b.id));

if (pastDue.length) {
  for (const { id, entry } of pastDue) {
    const track = entry.tracking ? `, tracked in ${entry.tracking}` : "";
    console.log(
      `::warning::baseline acceptance past review_by — ${id} (${entry.package}) ` +
        `was due ${entry.review_by}${track}. Re-justify the acceptance or land its remediation.`,
    );
  }
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
  console.log(`add its GHSA id to ${baselinePath} with a reason, accepted_on,`);
  console.log("review_by, and tracking ref under security-engineer review, then re-run.");
  process.exit(1);
}

console.log("✓ PASS: no new critical/high advisories beyond the baseline.");
process.exit(0);
