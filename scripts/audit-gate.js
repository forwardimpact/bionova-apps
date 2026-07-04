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
// ACCEPTANCE EXPIRY (review_by). A baselined critical/high may carry a
// `review_by` date and a `review_spec` pointer — the tracking spec that will
// actually resolve it. Past its `review_by`, an acceptance is overdue: the gate
// always emits a ::warning::, and in the nightly scheduled re-audit
// (GITHUB_EVENT_NAME=schedule) it fails closed. PR runs never block on an overdue
// date — a calendar must not hold contributors hostage — but the nightly turning
// red is the loud signal that a tracked fix (its `review_spec`) has slipped and
// needs re-prioritising. An entry with a `review_spec` but a null `review_by` is
// flagged as pending, so a tracked acceptance is never silently dateless.
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
// document instead of invoking bun (used by scripts/audit-gate.test.js). An
// empty or unparseable fixture exercises the fail-open path. Set AUDIT_GATE_NOW
// to an ISO date to pin "today" for review_by tests, and
// AUDIT_GATE_ENFORCE_REVIEW_BY=true to force nightly (fail-on-overdue) behaviour.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GATED = new Set(["critical", "high"]);
const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3, other: 4 };
const THRESHOLD = ["critical", "high"];
const baselinePath = process.argv[2] || "security/audit-baseline.json";

// Overdue acceptances fail the gate only in the nightly scheduled re-audit, not
// on PR runs. GitHub Actions sets GITHUB_EVENT_NAME automatically; the explicit
// override exists for tests.
const enforceReviewBy =
  (process.env.AUDIT_GATE_ENFORCE_REVIEW_BY ?? "").toLowerCase() === "true" ||
  process.env.GITHUB_EVENT_NAME === "schedule";

// "Today", overridable for deterministic tests.
function nowMs() {
  const override = process.env.AUDIT_GATE_NOW;
  return (override ? new Date(override) : new Date()).getTime();
}

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

// Stable advisory identity. Prefer the GHSA id from the advisory url. When bun's
// output carries no GHSA url (shape degraded), fall back to a collision-RESISTANT
// key: a numeric advisory id if present, otherwise package+severity+title. A
// blunt constant fallback (e.g. `id-undefined`) would dedupe distinct url-less
// advisories into one and could mask a new finding behind a baselined entry.
// Warn on any fallback — an unmatched key is treated as unbaselined.
function advisoryKey(pkg, a) {
  const fromUrl = String(a.url ?? "").split("/").pop();
  if (fromUrl && fromUrl.startsWith("GHSA-")) return fromUrl;
  const suffix = a.id != null ? String(a.id) : `${pkg}:${a.severity ?? "?"}:${a.title ?? ""}`;
  console.log(
    `::warning::advisory on ${pkg} has no GHSA url; using fallback key "nonghsa-${suffix}". ` +
      `It cannot be matched to the baseline by GHSA id and is treated as unbaselined.`,
  );
  return `nonghsa-${suffix}`;
}

// bun audit --json is keyed by package name -> array of advisory objects.
// Flatten into a map of advisory-key -> advisory, deduped across packages.
function flatten(auditJson) {
  const advisories = new Map();
  for (const [pkg, advs] of Object.entries(auditJson)) {
    if (!Array.isArray(advs)) continue;
    for (const a of advs) {
      const key = advisoryKey(pkg, a);
      if (!advisories.has(key)) {
        advisories.set(key, { ghsa: key, package: pkg, severity: a.severity, title: a.title, url: a.url });
      }
    }
  }
  return advisories;
}

// Surface baseline schema drift as non-fatal warnings rather than silently
// coercing it away. A malformed baseline is an infrastructure problem, so — like
// a registry outage — it warns and does not block; but it never passes silently.
function validateBaseline(baseline) {
  if (baseline.advisories == null || typeof baseline.advisories !== "object" || Array.isArray(baseline.advisories)) {
    console.log(`::warning::baseline is missing an "advisories" object — treating as empty. Schema drift?`);
    return;
  }
  const declared = Array.isArray(baseline.threshold) ? [...baseline.threshold].sort() : null;
  if (declared === null || declared.join(",") !== [...THRESHOLD].sort().join(",")) {
    console.log(
      `::warning::baseline "threshold" is ${JSON.stringify(baseline.threshold)} but the gate enforces ` +
        `${JSON.stringify(THRESHOLD)}. The field is descriptive only; align it or the doc misleads readers.`,
    );
  }
  for (const [id, e] of Object.entries(baseline.advisories)) {
    if (e == null || typeof e !== "object") {
      console.log(`::warning::baseline entry ${id} is not an object — schema drift.`);
      continue;
    }
    const missing = ["package", "severity", "reason", "accepted_on"].filter((f) => e[f] == null || e[f] === "");
    if (missing.length) console.log(`::warning::baseline entry ${id} is missing field(s): ${missing.join(", ")}.`);
    if (e.severity != null && !(e.severity in SEVERITY_RANK)) {
      console.log(`::warning::baseline entry ${id} has unknown severity "${e.severity}".`);
    }
  }
}

// Inspect review_by / review_spec on the still-live baselined acceptances.
// Returns { overdue, pending } id lists and prints a warning per finding.
function reviewByStatus(baseline, liveBaselineIds) {
  const overdue = [];
  const pending = [];
  const now = nowMs();
  for (const id of liveBaselineIds) {
    const e = baseline.advisories[id];
    if (!e) continue;
    const hasSpec = e.review_spec != null && e.review_spec !== "";
    if (e.review_by == null || e.review_by === "") {
      if (hasSpec) {
        pending.push(id);
        console.log(
          `::warning::acceptance ${id} (${e.package}) is tracked to ${e.review_spec} but has no review_by date set — pending.`,
        );
      }
      continue;
    }
    // Overdue once the whole review_by day has passed (end-of-day UTC).
    if (now > new Date(`${e.review_by}T23:59:59Z`).getTime()) {
      overdue.push(id);
      const via = hasSpec ? ` — tracking ${e.review_spec} has slipped` : "";
      console.log(
        `::warning::acceptance ${id} (${e.package}) is OVERDUE for review (review_by ${e.review_by})${via}.`,
      );
    }
  }
  return { overdue, pending };
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
validateBaseline(baseline);
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
// review_by only concerns acceptances that are still live (not stale/resolved).
const liveBaselineIds = [...baselineIds].filter((id) => gatedIds.has(id)).sort();
const { overdue } = reviewByStatus(baseline, liveBaselineIds);

console.log(
  `live advisories: ${advisories.size} total ` +
    `(critical ${bySeverity.critical.length}, high ${bySeverity.high.length}, ` +
    `moderate ${bySeverity.moderate.length}, low ${bySeverity.low.length})`,
);
console.log(`baselined critical/high: ${baselineIds.size}`);
console.log(`review_by enforcement: ${enforceReviewBy ? "ON (nightly — overdue fails)" : "off (PR run — overdue warns only)"}`);
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

let failed = false;

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
  console.log("");
  failed = true;
}

if (overdue.length) {
  console.log(`⚠ ${overdue.length} baselined acceptance(s) OVERDUE for review: ${overdue.join(", ")}`);
  if (enforceReviewBy) {
    console.log(`✗ FAIL: an accepted advisory has passed its review_by. Re-prioritise the tracking spec,`);
    console.log(`or, under security-engineer review, extend review_by with a dated reason.`);
    failed = true;
  } else {
    console.log(`(PR run — not blocking; the nightly re-audit fails on this.)`);
  }
  console.log("");
}

if (failed) process.exit(1);

console.log("✓ PASS: no new critical/high advisories beyond the baseline.");
process.exit(0);
