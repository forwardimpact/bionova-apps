#!/usr/bin/env bun
// CI dependency-compat gate for obstacle #210 / spec 220.
//
// Every CI quality gate installs and checks under bun, and `bun install` does
// NOT evaluate the npm `engines` field. So a dependency bump whose `engines.node`
// floor exceeds this repo's pinned Node runtime installs cleanly and passes every
// check green — no signal that the dep is unrunnable for the pinned runtime or
// for external npm/npx consumers.
//
// This gate is an EXPLICIT evaluator, never an install side-effect. bun ignores
// `engines` entirely, and any install that could enforce it (npm
// --engine-strict) would self-heal or skip on a foreign lockfile — the false-green
// trap the sibling spec-110 lockfile-integrity design fails on. So this script
// reads each installed dependency's `engines.node` itself and semver-tests it
// against one reconciled runtime pin. A green means the engines were EVALUATED,
// never that an install exited 0.
//
// Two halves, both fail-closed:
//   Reconciler — derive one pinned runtime from `.tool-versions` nodejs, checked
//     against `package.json` engines.node by FLOOR-EQUALITY (the pin must be the
//     minimum version engines.node admits). Editing either alone turns the check
//     red, so the floor the evaluator compares against cannot silently drift (SC2).
//   Evaluator — walk every installed manifest, read its `engines.node`, and fail
//     on any range the pinned runtime does not satisfy (SC1). A resolved zero-
//     manifest walk is treated as breakage and fails (SC4) — an empty tree must
//     never read green.
//
// Runs under bun so `Bun.semver` is always present (SC4: the parser can never be
// the absent tool). If this ever must run under plain Node, swap to the `semver`
// npm package — see design-a.md D5.
//
// Testability: the three inputs are overridable so scripts/engines-gate.test.js
// can drive committed fixtures without a live install —
//   ENGINES_GATE_TOOL_VERSIONS  path to a .tool-versions file (default .tool-versions)
//   ENGINES_GATE_PACKAGE_JSON    path to a package.json      (default package.json)
//   ENGINES_GATE_NODE_MODULES    install tree to walk        (default node_modules)
// Fixture install-trees are named `modules/`, NOT `node_modules/` — the repo
// .gitignore ignores every `node_modules/` segment, so a fixture tree under that
// name would be silently untracked and absent on a fresh CI checkout.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const toolVersionsPath = process.env.ENGINES_GATE_TOOL_VERSIONS ?? ".tool-versions";
const packageJsonPath = process.env.ENGINES_GATE_PACKAGE_JSON ?? "package.json";
const nodeModulesPath = process.env.ENGINES_GATE_NODE_MODULES ?? "node_modules";

function fail(msg) {
  console.log(`::error::${msg}`);
  console.log(`FAIL: ${msg}`);
  process.exit(1);
}

// --- Reconciler ---------------------------------------------------------------

function readPin() {
  let text;
  try {
    text = readFileSync(toolVersionsPath, "utf8");
  } catch (e) {
    return fail(`cannot read ${toolVersionsPath}: ${e.message}`);
  }
  const m = text.match(/^\s*nodejs\s+(\S+)\s*$/m);
  if (!m) return fail(`no 'nodejs <version>' line in ${toolVersionsPath}`);
  return m[1];
}

function readEnginesNode() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (e) {
    return fail(`cannot read/parse ${packageJsonPath}: ${e.message}`);
  }
  const range = pkg?.engines?.node;
  if (typeof range !== "string" || range.length === 0) {
    return fail(`no engines.node string in ${packageJsonPath}`);
  }
  return range;
}

// The largest version strictly below `v`. Borrows across minor/major with a
// sentinel high enough that no real Node version reaches it, so a range whose
// lower bound sits below the pin (drift where .tool-versions moved up but
// engines.node did not) still admits this predecessor and fails reconciliation.
function predecessor(v) {
  const parts = v.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  const [maj, min, pat] = parts;
  const HI = 1_000_000;
  if (pat > 0) return `${maj}.${min}.${pat - 1}`;
  if (min > 0) return `${maj}.${min - 1}.${HI}`;
  if (maj > 0) return `${maj - 1}.${HI}.${HI}`;
  return null; // pin is 0.0.0 — nothing below it
}

function reconcile(pin, range) {
  if (!Bun.semver.satisfies(pin, range)) {
    return fail(
      `.tool-versions nodejs ${pin} is not admitted by package.json engines.node "${range}" — the pinned runtime cannot run this workspace (SC2)`,
    );
  }
  const pred = predecessor(pin);
  if (pred !== null && Bun.semver.satisfies(pred, range)) {
    return fail(
      `reconciliation: .tool-versions nodejs ${pin} is not the floor of engines.node "${range}" — a lower Node (${pred}) also satisfies it, so the two declarations have drifted (SC2). Raise the pin to the range floor, or lower engines.node to match the pin.`,
    );
  }
  return pin;
}

// --- Evaluator ----------------------------------------------------------------

// Collect every package.json under the install tree, following directory
// symlinks (bun's default linker writes real dirs, but a store-linked layout
// must not read as an empty tree). `.bin`/`.cache` carry no manifests.
function collectManifests(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".bin" || e.name === ".cache") continue;
    const full = join(dir, e.name);
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) {
      collectManifests(full, out);
    } else if (e.name === "package.json") {
      out.push(full);
    }
  }
}

function evaluate(pin) {
  const manifests = [];
  collectManifests(nodeModulesPath, manifests);
  const walked = manifests.length;
  if (walked === 0) {
    return fail(
      `walked 0 manifests under ${nodeModulesPath} — a missing or empty install tree cannot be evaluated, so the gate fails closed rather than read green on nothing (SC4)`,
    );
  }
  const violations = [];
  for (const mpath of manifests) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(mpath, "utf8"));
    } catch {
      continue; // a nested unreadable/non-JSON file is not a dependency constraint
    }
    const range = pkg?.engines?.node;
    if (typeof range !== "string" || range.length === 0) continue; // unconstrained
    if (!Bun.semver.satisfies(pin, range)) {
      violations.push({ name: pkg.name ?? mpath, range, pin });
    }
  }
  violations.sort((a, b) => a.name.localeCompare(b.name));
  // SC4 observability: N counts manifests WALKED, not just those carrying an
  // engines.node, so a populated tree of only unconstrained deps still proves
  // the walk ran (N > 0).
  console.log(`walked ${walked} manifests against Node ${pin}`);
  if (violations.length > 0) {
    for (const v of violations) {
      console.log(
        `::error::${v.name} requires Node "${v.range}" — pinned runtime ${v.pin} does not satisfy it`,
      );
    }
    return fail(
      `${violations.length} dependency engines.node violation(s) against pinned Node ${pin}`,
    );
  }
  console.log(`PASS: all ${walked} manifests satisfy pinned Node ${pin}`);
}

const pin = reconcile(readPin(), readEnginesNode());
evaluate(pin);
