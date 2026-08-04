// Tests for the CI dependency-compat gate (spec 220 / obstacle #210). Drives
// engines-gate.mjs through committed fixtures — synthetic install-trees and
// tool-versions/engines pairs — and asserts its exit code, so the SC1/SC2/SC4
// fail cases stay verifiable on `main` without a live install (SC7).
import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(new URL("./engines-gate.mjs", import.meta.url));
const FIX = fileURLToPath(new URL("./fixtures/engines-gate/", import.meta.url));

const toolVersions = (name) => join(FIX, "tool-versions", name);
const packageJson = (name) => join(FIX, "package-json", name);
const modules = (name) => join(FIX, "modules", name);

// Run the gate with an explicit input triple, so the CWD defaults never apply.
function runGate({ tv, pj, nm }) {
  const env = {
    ...process.env,
    ENGINES_GATE_TOOL_VERSIONS: tv,
    ENGINES_GATE_PACKAGE_JSON: pj,
    ENGINES_GATE_NODE_MODULES: nm,
  };
  try {
    // process.execPath is bun under `bun test` — Bun.semver is always present.
    const stdout = execFileSync(process.execPath, [GATE], { env, encoding: "utf8" });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? "" };
  }
}

// A reconciled, in-range workspace: pin 22.23.1 == engines floor >=22.23.1, and
// every installed manifest satisfies it. The unconstrained dep (no engines.node)
// still counts toward the walked total.
test("SC1/SC6 — passes on a reconciled, in-range tree; unconstrained deps count", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-23-1.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("walked 3 manifests against Node 22.23.1");
  expect(r.stdout).toContain("PASS");
});

// SC1 fail: a dependency whose engines.node floor exceeds the pin turns it red.
test("SC1 — fails closed on a dep whose engines.node floor exceeds the pin", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-23-1.json"),
    nm: modules("violating"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("needs-node-24");
  expect(r.stdout).toContain(">=24.0.0");
});

// Disjoint-range semantics (eslint 10's real range) must parse as npm does: pin
// 22.23.1 satisfies via the `^22.13.0` arm, so the tree passes.
test("SC1 — disjoint range parses like npm: pin satisfies a middle arm → pass", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-23-1.json"),
    nm: modules("disjoint"),
  });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("PASS");
});

// The same disjoint range with a pin that lands in none of its arms (21.0.0 is
// above ^20.19.0's <21 ceiling, below ^22.13.0) → violation. Reconciled against
// a matching >=21.0.0 floor so the evaluator, not the reconciler, is exercised.
test("SC1 — disjoint range: a pin in no arm is a violation", () => {
  const r = runGate({
    tv: toolVersions("pin-21-0-0"),
    pj: packageJson("engines-21-0-0.json"),
    nm: modules("disjoint"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("eslint");
});

// SC2 drift: .tool-versions moved up (22.24.0) but engines.node still names the
// old floor (>=22.23.1) — a lower Node also satisfies, so they have drifted.
test("SC2 — fails when the pin sits above the engines.node floor (drift)", () => {
  const r = runGate({
    tv: toolVersions("pin-22-24-0"),
    pj: packageJson("engines-22-23-1.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("not the floor");
});

// SC2 drift the other way: engines.node raised (>=22.24.0) but the pin left at
// 22.23.1 — the pinned runtime cannot even satisfy the declared range.
test("SC2 — fails when the pin is below the engines.node floor (not admitted)", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-24-0.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("not admitted");
});

// Floor-equality holds across a minor borrow: pin 22.24.0 is the floor of
// >=22.24.0 (its predecessor 22.23.<hi> is not admitted) → reconciliation passes.
test("SC2 — floor-equality holds across a minor borrow", () => {
  const r = runGate({
    tv: toolVersions("pin-22-24-0"),
    pj: packageJson("engines-22-24-0.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("PASS");
});

// SC4: an empty install tree must fail closed, never read green on nothing.
test("SC4 — an empty install tree fails closed (walked 0)", () => {
  const empty = mkdtempSync(join(tmpdir(), "engines-gate-empty-"));
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-23-1.json"),
    nm: empty,
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("walked 0 manifests");
});

// SC4: a missing install tree (never installed) is likewise breakage, not clean.
test("SC4 — a missing install tree fails closed", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("engines-22-23-1.json"),
    nm: join(FIX, "modules", "does-not-exist"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("walked 0 manifests");
});

// Malformed inputs fail closed, never skip.
test("SC4 — a .tool-versions with no nodejs line fails closed", () => {
  const r = runGate({
    tv: toolVersions("no-nodejs-line"),
    pj: packageJson("engines-22-23-1.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("no 'nodejs");
});

test("SC4 — a package.json with no engines.node fails closed", () => {
  const r = runGate({
    tv: toolVersions("pin-22-23-1"),
    pj: packageJson("no-engines.json"),
    nm: modules("compat"),
  });
  expect(r.code).toBe(1);
  expect(r.stdout).toContain("no engines.node");
});
