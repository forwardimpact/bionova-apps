import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { checkEligibility } from "../src/index.js";
import { jsonResponse } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

test("checkEligibility returns the edge-function score and inserts a signal", async () => {
  let insertBody = null;
  let representationRequested = false;
  const fetchImpl = (url, init = {}) => {
    if (url.includes("/functions/v1/eligibility-check")) {
      return Promise.resolve(jsonResponse({ match_score: "eligible", reasons: ["meets age"] }));
    }
    if (url.includes("interest_signals")) {
      insertBody = JSON.parse(init.body);
      if (init.headers?.Prefer?.includes("return=representation")) representationRequested = true;
      return Promise.resolve(jsonResponse(null, { status: 201 }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await checkEligibility({
    data,
    args: { id: "diabetes-prevention" },
    options: { age: 55, conditions: ["diabetes-t2"] },
  });

  expect(res.match_score).toBe("eligible");
  expect(res.reasons).toContain("meets age");
  expect(insertBody.trial_id).toBe("diabetes-prevention");
  expect(insertBody.match_score).toBe("eligible");
  // Anonymous insert must NOT request representation (staff-only SELECT).
  expect(representationRequested).toBe(false);
  // Stored answers but no signal_id read back when no representation.
  expect(res.signal_id).toBeUndefined();
});

test("checkEligibility still returns a score if the signal insert fails", async () => {
  const fetchImpl = (url) => {
    if (url.includes("eligibility-check"))
      return Promise.resolve(jsonResponse({ match_score: "possibly_eligible", reasons: [] }));
    if (url.includes("interest_signals"))
      return Promise.resolve(jsonResponse("denied", { status: 401 }));
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await checkEligibility({ data, args: { id: "t1" }, options: {} });
  expect(res.match_score).toBe("possibly_eligible");
});
