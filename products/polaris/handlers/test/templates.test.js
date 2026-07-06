import { test, expect } from "bun:test";
import fsSync from "node:fs";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { TEMPLATES_DIR } from "../src/templates-dir.js";
import { buildPreCheck } from "../src/eligibility-view.js";

const ENUM_TOKENS = ["eligible", "possibly_eligible", "not_eligible"];
const LUNG = {
  "lung-cancer": { id: "lung-cancer", name: "Non-Small Cell Lung Cancer" },
};

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
    "show-trial.md": {
      trial: { name: "T", id: "t1" },
      criteria: { inclusion: {}, exclusion: {} },
      sites: [],
      conditions: [],
      faq: "Q",
      consentSummary: "C",
    },
    "show-condition.md": {
      condition: { name: "Diabetes", icd10: [], synonyms: [] },
      explainer: "About.",
    },
    "check-eligibility.md": {
      summary: "S",
      supports: [],
      against: [],
      unclear: [],
      coordinatorQuestions: [],
      disclaimer: "D",
      nextStep: "N",
    },
    "list-sites.md": {
      sites: [
        { name: "North", city: "Boston", specialties: [], description: "Desc" },
      ],
    },
    "list-stories.md": {
      stories: [
        { story_index: 0, condition_id: "diabetes-t2", story: "Story." },
      ],
    },
    "show-about.md": {
      mission: "M",
      partnerships: ["P"],
      contact: "x@y.z",
      therapies: [{ topic: "t", description: "d" }],
    },
    "manage-trial.md": {
      trial: { name: "T", id: "t1" },
      signals: { eligible: 1, possibly_eligible: 0, not_eligible: 0, total: 1 },
    },
  };
  for (const [name, data] of Object.entries(cases)) {
    const md = loader.render(name, data);
    expect(md.trim().length).toBeGreaterThan(0);
  }
});

// C3/C4 — every outcome carries the disclaimer and next step and leaks no raw
// enum token to the surface.
test("check-eligibility.md renders every outcome with disclaimer + next step, no enum token", () => {
  const loader = createTemplateLoader(TEMPLATES_DIR, runtime);
  for (const match_score of ENUM_TOKENS) {
    const vm = buildPreCheck(
      { inclusion: null, exclusion: null },
      { match_score, reasons: [] },
    );
    const md = loader.render("check-eligibility.md", vm);
    expect(md).toContain(vm.disclaimer);
    expect(md).toContain(vm.nextStep);
    for (const token of ENUM_TOKENS) {
      expect(md).not.toContain(token);
    }
  }
});

// C1/C2 — custom[] renders only under coordinator-questions; the ECOG unclear
// prompt appears verbatim (pins the design's ECOG wording); no label-value line.
test("check-eligibility.md places custom[] only under coordinator-questions", () => {
  const loader = createTemplateLoader(TEMPLATES_DIR, runtime);
  const vm = buildPreCheck(
    {
      inclusion: { conditions_required: ["lung_cancer"], custom: [] },
      exclusion: { conditions_excluded: [], custom: ["EXCLUSION_CUSTOM_A"] },
    },
    {
      match_score: "possibly_eligible",
      reasons: ["Has required condition: lung_cancer", "ECOG not provided"],
    },
    LUNG,
  );
  const md = loader.render("check-eligibility.md", vm);

  const coordHeading = md.indexOf("Questions to confirm with the coordinator");
  expect(coordHeading).toBeGreaterThan(-1);
  // The custom string appears once, and only after the coordinator heading.
  expect(md.indexOf("EXCLUSION_CUSTOM_A")).toBeGreaterThan(coordHeading);
  expect(md.lastIndexOf("EXCLUSION_CUSTOM_A")).toBe(
    md.indexOf("EXCLUSION_CUSTOM_A"),
  );
  // The exact ECOG unclear sentence renders verbatim (design open question).
  expect(md).toContain(
    "This trial has a physical-ability (performance status) requirement a coordinator can help you gauge.",
  );
  // No raw label-value lines leak through.
  expect(md).not.toContain("Age:");
  expect(md).not.toContain("ECOG max:");
});

// Pins the libtemplate `.length` heading guard: an empty bucket omits its head.
test("check-eligibility.md omits a heading for an empty bucket", () => {
  const loader = createTemplateLoader(TEMPLATES_DIR, runtime);
  const vm = buildPreCheck(
    {
      inclusion: { conditions_required: ["lung_cancer"], custom: [] },
      exclusion: null,
    },
    {
      match_score: "eligible",
      reasons: ["Has required condition: lung_cancer"],
    },
    LUNG,
  );
  const md = loader.render("check-eligibility.md", vm);
  expect(vm.against).toEqual([]);
  expect(md).not.toContain("Where you likely do not fit");
  expect(md).toContain("Where you likely fit");
});
