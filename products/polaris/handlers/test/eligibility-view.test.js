import { test, expect } from "bun:test";
import { buildPreCheck } from "../src/eligibility-view.js";

// Anchored on oncora-phase3's criteria STRUCTURE from data/synthetic/story.dsl:
// age 18-75, ecog_max 2, required `lung_cancer` (resolves to a catalog name),
// excluded `active_autoimmune_disease` (no condition entity → exercises the S2
// unresolvable-slug fallback on the anchor itself). The free-text custom[] prose
// is deliberately synthetic here, not the seed's clinical strings: the pre-check
// must never hold criterion prose in committed source (C5), so tests carry test
// doubles and read the real prose only from the DB at runtime.
const INC_CUSTOM = [
  "INCLUSION_CUSTOM_A",
  "INCLUSION_CUSTOM_B",
  "INCLUSION_CUSTOM_C",
];
const EXC_CUSTOM = [
  "EXCLUSION_CUSTOM_A",
  "EXCLUSION_CUSTOM_B",
  "EXCLUSION_CUSTOM_C",
];

const ONCORA = {
  inclusion: {
    age_min: 18,
    age_max: 75,
    ecog_max: 2,
    conditions_required: ["lung_cancer"],
    custom: INC_CUSTOM,
  },
  exclusion: {
    conditions_excluded: ["active_autoimmune_disease"],
    active_autoimmune: true,
    prior_immunotherapy: false,
    custom: EXC_CUSTOM,
  },
};

const LUNG = {
  "lung-cancer": { id: "lung-cancer", name: "Non-Small Cell Lung Cancer" },
};

const ENUM_TOKENS = ["eligible", "possibly_eligible", "not_eligible"];

// B1 — age renders as a plain-language sentence, not the raw label-value line;
// the unanswered form renders as an answerable prompt (affirmative half of C1).
test("B1: age within → supports sentence; age not provided → unclear prompt", () => {
  const within = buildPreCheck(
    ONCORA,
    { match_score: "possibly_eligible", reasons: ["Age 55 within [18, 75]"] },
    LUNG,
  );
  expect(within.supports).toHaveLength(1);
  expect(within.supports[0]).toBe(
    "Your age (55) is within this trial's range of 18 to 75.",
  );
  expect(within.supports[0]).not.toContain("Age:");
  expect(within.supports[0]).not.toContain("[18, 75]");

  const missing = buildPreCheck(
    ONCORA,
    { match_score: "possibly_eligible", reasons: ["Age not provided"] },
    LUNG,
  );
  expect(missing.unclear).toHaveLength(1);
  expect(missing.unclear[0]).toContain("Add your age");
});

// B1b — the scorer interpolates req.age verbatim, so a valid non-integer or
// negative age reaches the reason string. The age capture must parse it (render
// the value the patient gave) rather than trip the fail-loud, which guards
// scorer-grammar drift, not valid-but-unusual ages.
test("B1b: non-integer and negative ages parse and render, not throw", () => {
  const decimal = buildPreCheck(
    ONCORA,
    { match_score: "possibly_eligible", reasons: ["Age 55.5 within [18, 75]"] },
    LUNG,
  );
  expect(decimal.supports).toEqual([
    "Your age (55.5) is within this trial's range of 18 to 75.",
  ]);

  const negative = buildPreCheck(
    ONCORA,
    { match_score: "not_eligible", reasons: ["Age -3 outside [18, 75]"] },
    LUNG,
  );
  expect(negative.against).toEqual([
    "This trial enrolls ages 18 to 75; the age you gave (-3) is outside that range.",
  ]);
});

// B2 — every ECOG line is a full plain-language sentence with no `ECOG max:`
// form and no ECOG numeral (the design's open question, pinned) (C1).
test("B2: ECOG lines are numeral-free plain-language sentences", () => {
  const supports = buildPreCheck(
    ONCORA,
    { match_score: "eligible", reasons: ["ECOG 2 <= 2"] },
    LUNG,
  ).supports;
  const against = buildPreCheck(
    ONCORA,
    { match_score: "not_eligible", reasons: ["ECOG 3 exceeds max 2"] },
    LUNG,
  ).against;
  const unclear = buildPreCheck(
    ONCORA,
    { match_score: "possibly_eligible", reasons: ["ECOG not provided"] },
    LUNG,
  ).unclear;

  const ecogLines = [...supports, ...against, ...unclear];
  expect(ecogLines).toHaveLength(3);
  for (const line of ecogLines) {
    expect(line).not.toContain("ECOG");
    expect(line).not.toMatch(/\d/); // no numeral shown
    expect(line.endsWith(".")).toBe(true); // full sentence
  }
});

// B3 — resolved condition slug renders the catalog name in supports.
test("B3: Has required condition resolves the slug to its catalog name", () => {
  const vm = buildPreCheck(
    ONCORA,
    {
      match_score: "eligible",
      reasons: ["Has required condition: lung_cancer"],
    },
    LUNG,
  );
  expect(vm.supports).toEqual([
    "You reported Non-Small Cell Lung Cancer, which this trial requires.",
  ]);
});

// B4 — an unresolvable excluded slug goes only to coordinator-questions, never
// the against bucket, and is never labeled (design substrate 2).
test("B4: unresolvable excluded slug lands only in coordinatorQuestions", () => {
  const vm = buildPreCheck(
    ONCORA,
    {
      match_score: "not_eligible",
      reasons: ["Excluded condition: active_autoimmune_disease"],
    },
    LUNG, // no active-autoimmune-disease entry → unresolvable
  );
  expect(vm.against).toEqual([]);
  expect(
    vm.coordinatorQuestions.some((q) => q.includes("clinical terms")),
  ).toBe(true);
  // Never fabricates a label from the slug.
  for (const bucket of [vm.supports, vm.against, vm.unclear]) {
    expect(bucket.join(" ")).not.toContain("autoimmune");
  }
});

// B4b — the required-condition branches share resolveName with the excluded
// branch: an unresolvable required slug also routes to coordinator-questions and
// is never bucketed or labeled, for both the has- and missing-required forms.
test("B4b: unresolvable required slug (has/missing) routes only to coordinatorQuestions", () => {
  for (const verb of ["Has required condition", "Missing required condition"]) {
    const vm = buildPreCheck(
      ONCORA,
      {
        match_score: "possibly_eligible",
        reasons: [`${verb}: rare_disease_x`],
      },
      LUNG, // no rare-disease-x entry → unresolvable
    );
    expect(vm.supports).toEqual([]);
    expect(vm.against).toEqual([]);
    expect(
      vm.coordinatorQuestions.some((q) => q.includes("clinical terms")),
    ).toBe(true);
    for (const bucket of [vm.supports, vm.against, vm.unclear]) {
      expect(bucket.join(" ")).not.toContain("rare");
    }
  }
});

// B5 — against-bucket rendering names the resolved condition where applicable.
test("B5: against lines render plain language and resolved names", () => {
  const vm = buildPreCheck(
    ONCORA,
    {
      match_score: "not_eligible",
      reasons: [
        "Age 80 outside [18, 75]",
        "ECOG 3 exceeds max 2",
        "Missing required condition: lung_cancer",
      ],
    },
    LUNG,
  );
  expect(vm.against).toEqual([
    "This trial enrolls ages 18 to 75; the age you gave (80) is outside that range.",
    "This trial asks for a level of day-to-day physical ability above what you reported.",
    "This trial requires Non-Small Cell Lung Cancer, which you did not report.",
  ]);
});

// B6 — the four <custom> reasons never enter a bucket; with no Excluded
// condition reason, coordinatorQuestions is the criteria custom[] verbatim in
// order (inclusion then exclusion) (C2/S2).
test("B6: custom reasons dropped; coordinatorQuestions is criteria custom[] verbatim", () => {
  const vm = buildPreCheck(
    ONCORA,
    {
      match_score: "not_eligible",
      reasons: [
        `Meets: ${INC_CUSTOM[0]}`,
        `Does not meet: ${INC_CUSTOM[1]}`,
        `Unanswered: ${INC_CUSTOM[2]}`,
        `Excluded: ${EXC_CUSTOM[1]}`,
      ],
    },
    LUNG,
  );
  expect(vm.coordinatorQuestions).toEqual([...INC_CUSTOM, ...EXC_CUSTOM]);
  expect(vm.supports).toEqual([]);
  expect(vm.against).toEqual([]);
  expect(vm.unclear).toEqual([]);
});

// B7 — plural "Required conditions not provided" is unclear, not against.
test("B7: Required conditions not provided is unclear (plural/singular trap)", () => {
  const vm = buildPreCheck(
    ONCORA,
    {
      match_score: "possibly_eligible",
      reasons: ["Required conditions not provided"],
    },
    LUNG,
  );
  expect(vm.against).toEqual([]);
  expect(vm.unclear).toHaveLength(1);
  expect(vm.unclear[0]).toContain("Add your conditions");
});

// B8 — an unknown reason string throws, so a scorer grammar drift fails loud.
test("B8: an unrecognized reason throws", () => {
  expect(() =>
    buildPreCheck(
      ONCORA,
      { match_score: "eligible", reasons: ["Astrological sign favorable"] },
      LUNG,
    ),
  ).toThrow("Unrecognized eligibility reason:");
});

// B8b — both criteria halves null (a trial with no structured criteria rows):
// buildPreCheck tolerates the null shape, does not throw, and yields empty
// coordinatorQuestions (no custom[] to carry, no unresolvable condition).
test("B8b: null criteria halves → no throw, empty coordinatorQuestions", () => {
  const vm = buildPreCheck(
    { inclusion: null, exclusion: null },
    { match_score: "possibly_eligible", reasons: [] },
    LUNG,
  );
  expect(vm.coordinatorQuestions).toEqual([]);
  expect(vm.supports).toEqual([]);
  expect(vm.against).toEqual([]);
  expect(vm.unclear).toEqual([]);
});

// B9 — every summary is plain language with no raw enum token; disclaimer and
// next step render on all three outcomes (C3/C4).
test("B9: summary carries no enum token; disclaimer + nextStep on all outcomes", () => {
  for (const match_score of ENUM_TOKENS) {
    const vm = buildPreCheck(ONCORA, { match_score, reasons: [] }, LUNG);
    for (const token of ENUM_TOKENS) {
      expect(vm.summary).not.toContain(token);
    }
    expect(vm.disclaimer).toContain("self-assessment");
    expect(vm.nextStep).toContain("coordinator");
  }
});
