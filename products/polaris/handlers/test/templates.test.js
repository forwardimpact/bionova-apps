import { test, expect } from "bun:test";
import fsSync from "node:fs";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { TEMPLATES_DIR } from "../src/templates-dir.js";

// libtemplate's loader takes a runtime; it only reads `fsSync`, so a minimal
// runtime suffices here.
const runtime = { fsSync };

test("TEMPLATES_DIR points at the shared templates directory", () => {
  expect(fsSync.existsSync(TEMPLATES_DIR)).toBe(true);
});

test("search-trials.md renders non-empty markdown for a sample result", () => {
  const loader = createTemplateLoader(TEMPLATES_DIR, runtime);
  const sample = {
    total: 1,
    query: { condition: "diabetes-t2" },
    trials: [
      {
        id: "diabetes-prevention",
        name: "Diabetes Prevention Outcomes Study",
        phase: "Phase 3",
        status: "recruiting",
        therapeutic_area: "Endocrinology",
        current_enrollment: 120,
        target_enrollment: 400,
        sites_count: 2,
        conditions: [{ id: "diabetes-t2", name: "Type 2 Diabetes Mellitus" }],
      },
    ],
  };
  const md = loader.render("search-trials.md", sample);
  expect(md.length).toBeGreaterThan(0);
  expect(md).toContain("Diabetes Prevention Outcomes Study");
  expect(md).toContain("Type 2 Diabetes Mellitus");
});

test("every handler template renders non-empty output for a minimal shape", () => {
  const loader = createTemplateLoader(TEMPLATES_DIR, runtime);
  const cases = {
    "show-trial.md": { trial: { name: "T", id: "t1" }, criteria: { inclusion: {}, exclusion: {} }, sites: [], conditions: [], faq: "Q", consentSummary: "C" },
    "show-condition.md": { condition: { name: "Diabetes", icd10: [], synonyms: [] }, explainer: "About." },
    "check-eligibility.md": { match_score: "eligible", reasons: ["ok"] },
    "list-sites.md": { sites: [{ name: "North", city: "Boston", specialties: [], description: "Desc" }] },
    "list-stories.md": { stories: [{ story_index: 0, condition_id: "diabetes-t2", story: "Story." }] },
    "show-about.md": { mission: "M", partnerships: ["P"], contact: "x@y.z", therapies: [{ topic: "t", description: "d" }] },
    "manage-trial.md": { trial: { name: "T", id: "t1" }, signals: { eligible: 1, possibly_eligible: 0, not_eligible: 0, total: 1 } },
  };
  for (const [name, data] of Object.entries(cases)) {
    const md = loader.render(name, data);
    expect(md.trim().length).toBeGreaterThan(0);
  }
});
