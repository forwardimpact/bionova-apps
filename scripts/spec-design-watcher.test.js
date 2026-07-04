// Verifies the spec→design watcher's specs_awaiting_design gauge against a
// synthetic fixture (issue #23). The fixture holds one awaiting spec plus two
// negative controls, so a gauge that miscounts (e.g. counts every spec.md)
// fails here rather than in production.

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computeSpecsAwaitingDesign,
  fsSource,
  parseStatusRows,
  statusIndex,
} from "./spec-design-watcher.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "specs-awaiting-design");
// A fixed "now" well past 010's merged_at (2026-07-01) so the flag is deterministic.
const NOW = new Date("2026-07-04T00:00:00Z");

describe("specs_awaiting_design gauge", () => {
  test("fixture reports exactly 1 (only spec 010)", () => {
    const result = computeSpecsAwaitingDesign(fsSource(fixture), NOW);
    expect(result.specsAwaitingDesign).toBe(1);
    expect(result.awaiting).toEqual(["010"]);
  });

  test("spec 010 is flagged past the 2-day clock", () => {
    const result = computeSpecsAwaitingDesign(fsSource(fixture), NOW);
    expect(result.flagged).toEqual(["010"]);
  });

  test("an empty repo reports an earned 0", () => {
    const empty = { specIds: [], hasDesign: () => false, statusText: "", mergedAt: () => null };
    expect(computeSpecsAwaitingDesign(empty, NOW).specsAwaitingDesign).toBe(0);
  });

  test("design-a.md alone excludes a spec even with no ledger row", () => {
    const source = {
      specIds: ["040"],
      hasDesign: (id) => id === "040",
      statusText: "",
      mergedAt: () => null,
    };
    expect(computeSpecsAwaitingDesign(source, NOW).specsAwaitingDesign).toBe(0);
  });

  test("a spec with no ledger row and no design still counts", () => {
    const source = {
      specIds: ["050"],
      hasDesign: () => false,
      statusText: "",
      mergedAt: () => null,
    };
    expect(computeSpecsAwaitingDesign(source, NOW).specsAwaitingDesign).toBe(1);
  });

  test("cancelled specs are not awaiting", () => {
    const source = {
      specIds: ["060"],
      hasDesign: () => false,
      statusText: "```\n060\tspec\tcancelled\n```",
      mergedAt: () => null,
    };
    expect(computeSpecsAwaitingDesign(source, NOW).specsAwaitingDesign).toBe(0);
  });
});

describe("ledger parsing", () => {
  test("exp: rows are not indexed as specs", () => {
    const rows = parseStatusRows("```\n010\tdesign\tdraft\nexp:99\tregistered\t-\t#99\n```");
    const index = statusIndex(rows);
    expect(index.has("010")).toBe(true);
    expect(index.has("exp:99")).toBe(false);
  });

  test("empty ledger yields no rows", () => {
    expect(parseStatusRows("```\n```")).toEqual([]);
    expect(parseStatusRows("")).toEqual([]);
  });
});
