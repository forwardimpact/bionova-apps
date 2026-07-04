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

function runGate(auditFile) {
  try {
    const stdout = execFileSync("node", [GATE, baseline], {
      env: { ...process.env, AUDIT_JSON_FILE: auditFile },
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? "" };
  }
}

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
