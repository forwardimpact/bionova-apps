// Tests for the CI dependency-audit gate (issue #22). Drives audit-gate.js
// through AUDIT_JSON_FILE fixtures and asserts its exit code, so the gate's
// baseline-diff logic is verified without a live network audit.
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GATE = new URL("./audit-gate.js", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));

// A minimal baseline holding one accepted critical advisory.
const baseline = join(dir, "baseline.json");
writeFileSync(
  baseline,
  JSON.stringify({
    threshold: ["critical", "high"],
    advisories: {
      "GHSA-known-crit-0001": {
        package: "vitest",
        severity: "critical",
        reason: "accepted",
        accepted_on: "2026-07-04",
      },
    },
  }),
);

function fixture(name, doc) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(doc));
  return path;
}

// Raw (possibly non-JSON) fixture, for exercising the fail-open path.
function rawFixture(name, text) {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

function runGateWith(baselineFile, auditFile, extraEnv = {}) {
  try {
    // Strip the trigger-control vars from the inherited env so a test's own
    // extraEnv is the SOLE source of the gate's review_by mode. Without this,
    // the ambient GITHUB_EVENT_NAME leaks in: the nightly re-audit
    // (check-audit.yml on schedule) runs this suite with
    // GITHUB_EVENT_NAME=schedule, flipping the gate to fail-on-overdue and
    // turning the "PR run" tests falsely red — which skips the real gate step.
    const { GITHUB_EVENT_NAME, AUDIT_GATE_ENFORCE_REVIEW_BY, ...cleanEnv } = process.env;
    // process.execPath is the runtime running this test (bun under `bun test`,
    // node under node) — keeps the gate on the same toolchain as the workflow.
    const stdout = execFileSync(process.execPath, [GATE, baselineFile], {
      env: { ...cleanEnv, AUDIT_JSON_FILE: auditFile, ...extraEnv },
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? "" };
  }
}

function runGate(auditFile) {
  return runGateWith(baseline, auditFile);
}

// Write a baseline holding a single accepted-high `next` advisory, so review_by
// paths can be exercised against a live matching audit fixture.
function baselineWith(name, entry) {
  const path = join(dir, name);
  writeFileSync(
    path,
    JSON.stringify({
      threshold: ["critical", "high"],
      advisories: { "GHSA-review-high-0009": { package: "next", severity: "high", reason: "accepted", accepted_on: "2026-07-04", ...entry } },
    }),
  );
  return path;
}

const liveReviewHigh = { url: "https://github.com/advisories/GHSA-review-high-0009", severity: "high", title: "tracked high" };

const knownCrit = { url: "https://github.com/advisories/GHSA-known-crit-0001", severity: "critical", title: "known" };
const newHigh = { url: "https://github.com/advisories/GHSA-new-high-0002", severity: "high", title: "new high" };
const moderate = { url: "https://github.com/advisories/GHSA-mod-0003", severity: "moderate", title: "mod" };

test("passes when live crit/high match the baseline", () => {
  const r = runGate(fixture("match.json", { vitest: [knownCrit] }));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("PASS");
});

test("fails on a new critical/high not in the baseline", () => {
  const r = runGate(fixture("new.json", { vitest: [knownCrit], next: [newHigh] }));
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("GHSA-new-high-0002");
});

test("moderate/low never gate", () => {
  const r = runGate(fixture("mod.json", { vitest: [knownCrit], esbuild: [moderate] }));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("report-only");
});

test("resolved advisory (fewer than baseline) passes with a stale warning", () => {
  const r = runGate(fixture("resolved.json", {}));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("stale baseline");
});

test("fails open (exit 0 + warning) when the advisory service gives no output", () => {
  const r = runGate(rawFixture("empty.txt", "   "));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("::warning::");
});

test("fails open (exit 0 + warning) when the advisory output is not valid JSON", () => {
  const r = runGate(rawFixture("garbage.txt", "503 Service Unavailable"));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("::warning::");
});

test("review_spec with null review_by is flagged pending (warns, does not block)", () => {
  const bl = baselineWith("pending.json", { review_spec: "#29", review_by: null });
  const r = runGateWith(bl, fixture("pending-audit.json", { next: [liveReviewHigh] }));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("no review_by date set — pending");
});

test("overdue review_by warns but does NOT block on a PR run", () => {
  const bl = baselineWith("overdue-pr.json", { review_spec: "#29", review_by: "2026-06-01" });
  const r = runGateWith(bl, fixture("overdue-pr-audit.json", { next: [liveReviewHigh] }), { AUDIT_GATE_NOW: "2026-07-04" });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("OVERDUE");
});

test("overdue review_by FAILS the nightly re-audit (enforce mode)", () => {
  const bl = baselineWith("overdue-nightly.json", { review_spec: "#29", review_by: "2026-06-01" });
  const r = runGateWith(bl, fixture("overdue-nightly-audit.json", { next: [liveReviewHigh] }), {
    AUDIT_GATE_NOW: "2026-07-04",
    AUDIT_GATE_ENFORCE_REVIEW_BY: "true",
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("passed its review_by");
});

test("review_by still in the future does not warn or block, even in enforce mode", () => {
  const bl = baselineWith("future.json", { review_spec: "#29", review_by: "2026-12-31" });
  const r = runGateWith(bl, fixture("future-audit.json", { next: [liveReviewHigh] }), {
    AUDIT_GATE_NOW: "2026-07-04",
    AUDIT_GATE_ENFORCE_REVIEW_BY: "true",
  });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("PASS");
  expect(r.stdout).not.toContain("OVERDUE");
});

test("a resolved (stale) acceptance does not fire an overdue failure", () => {
  // review_by is in the past, but the advisory is gone from the live audit — the
  // stale-removal warning owns it, not the overdue path.
  const bl = baselineWith("stale-overdue.json", { review_spec: "#29", review_by: "2026-06-01" });
  const r = runGateWith(bl, fixture("stale-audit.json", {}), {
    AUDIT_GATE_NOW: "2026-07-04",
    AUDIT_GATE_ENFORCE_REVIEW_BY: "true",
  });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("stale baseline");
  expect(r.stdout).not.toContain("OVERDUE");
});

test("malformed baseline entry surfaces a schema-drift warning (non-fatal)", () => {
  const bl = join(dir, "malformed.json");
  writeFileSync(bl, JSON.stringify({ threshold: ["critical", "high"], advisories: { "GHSA-bad-0010": { package: "next" } } }));
  const r = runGateWith(bl, fixture("malformed-audit.json", {}));
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("missing field(s)");
});

test("an advisory with no GHSA url warns and is treated as unbaselined", () => {
  const urlless = { severity: "high", title: "no url high", id: 4242 };
  const r = runGate(fixture("urlless.json", { vitest: [knownCrit], next: [urlless] }));
  expect(r.stdout).toContain("no GHSA url");
  // unmatched key -> treated as a new critical/high -> gate fails
  expect(r.code).toBe(1);
});
