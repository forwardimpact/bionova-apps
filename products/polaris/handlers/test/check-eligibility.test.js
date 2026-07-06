import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { checkEligibility } from "../src/index.js";
import { makeFetch, route } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

// oncora-phase3 criteria structure: required lung_cancer resolves to a catalog
// name; excluded active_autoimmune_disease does not. custom[] prose is a test
// double, never the seed's clinical strings — the pre-check holds no criterion
// prose in committed source (C5).
const CRITERIA = {
  inclusion: {
    age_min: 18,
    age_max: 75,
    ecog_max: 2,
    conditions_required: ["lung_cancer"],
    custom: ["INCLUSION_CUSTOM_A"],
  },
  exclusion: {
    conditions_excluded: ["active_autoimmune_disease"],
    active_autoimmune: true,
    prior_immunotherapy: false,
    custom: ["EXCLUSION_CUSTOM_A"],
  },
};

test("checkEligibility returns the score, the view model, and inserts a signal", async () => {
  const { fetchImpl, calls } = makeFetch([
    route("/functions/v1/eligibility-check", {
      match_score: "eligible",
      reasons: [
        "Age 55 within [18, 75]",
        "Has required condition: lung_cancer",
      ],
    }),
    route("conditions?id=in.(", [
      { id: "lung-cancer", name: "Non-Small Cell Lung Cancer" },
    ]),
    route("criteria?trial_id=", [CRITERIA]),
    route("interest_signals", null, { status: 201 }),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await checkEligibility({
    data,
    args: { id: "oncora-phase3" },
    options: { age: 55, conditions: ["lung_cancer"] },
  });

  // Score + reasons stay on the return (web screener reads match_score, X6).
  expect(res.match_score).toBe("eligible");
  expect(res.reasons).toContain("Has required condition: lung_cancer");

  // View model is present for the template.
  expect(typeof res.summary).toBe("string");
  expect(res.supports).toContain(
    "You reported Non-Small Cell Lung Cancer, which this trial requires.",
  );
  expect(Array.isArray(res.against)).toBe(true);
  expect(Array.isArray(res.unclear)).toBe(true);
  expect(Array.isArray(res.coordinatorQuestions)).toBe(true);

  // Insert body is byte-for-byte the anonymous signal — no new field (C5).
  const insert = calls.find((c) => c.url.includes("interest_signals"));
  const insertBody = JSON.parse(insert.init.body);
  expect(Object.keys(insertBody).sort()).toEqual([
    "match_score",
    "screener_answers",
    "trial_id",
  ]);
  expect(insertBody.trial_id).toBe("oncora-phase3");
  expect(insertBody.match_score).toBe("eligible");
  // Anonymous insert must NOT request representation (staff-only SELECT).
  expect(insert.init.headers?.Prefer ?? "").not.toContain(
    "return=representation",
  );
  expect(res.signal_id).toBeUndefined();
});

test("checkEligibility still returns a score if the signal insert fails", async () => {
  const { fetchImpl } = makeFetch([
    route("/functions/v1/eligibility-check", {
      match_score: "possibly_eligible",
      reasons: [],
    }),
    route("criteria?trial_id=", []), // no criteria → no slug resolution
    route("interest_signals", "denied", { status: 401 }),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await checkEligibility({ data, args: { id: "t1" }, options: {} });
  expect(res.match_score).toBe("possibly_eligible");
  expect(typeof res.summary).toBe("string");
});
