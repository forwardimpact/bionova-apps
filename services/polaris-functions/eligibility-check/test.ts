// Pure unit tests for eligibility-check scoring. The criteria fixture is the
// verbatim diabetes-prevention row from the rendered seed. handle() is exercised
// with a mocked fetch for the PostgREST criteria query.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Criteria, fetchCriteria, handle, score } from "./mod.ts";
import type { Env } from "../env.ts";

const env: Env = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  TEI_URL: "http://tei:80",
  PGREST_URL: "http://kong:8000/rest/v1",
};

// diabetes-prevention, from 202501010005_seed_005_criteria.sql.
const criteria: Criteria = {
  inclusion: {
    age_min: 30,
    age_max: 70,
    conditions_required: ["diabetes_t2"],
    ecog_max: 1,
    custom: [
      "HbA1c between 7.0% and 10.5%",
      "BMI between 25 and 40",
      "On stable metformin dose for 3+ months",
    ],
  },
  exclusion: {
    conditions_excluded: ["type_1_diabetes", "gestational_diabetes"],
    active_autoimmune: false,
    prior_immunotherapy: false,
    custom: [
      "eGFR below 45 mL/min",
      "History of diabetic ketoacidosis",
      "Use of insulin within 3 months",
    ],
  },
};

Deno.test("score: fully-qualified patient is eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 55,
    ecog: 0,
    conditions: ["diabetes_t2"],
    custom_answers: {
      "HbA1c between 7.0% and 10.5%": true,
      "BMI between 25 and 40": true,
      "On stable metformin dose for 3+ months": true,
    },
  });
  assertEquals(out.match_score, "eligible");
});

Deno.test("score: exclusion custom match is not_eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 55,
    ecog: 0,
    conditions: ["diabetes_t2"],
    custom_answers: {
      "HbA1c between 7.0% and 10.5%": true,
      "BMI between 25 and 40": true,
      "On stable metformin dose for 3+ months": true,
      "Use of insulin within 3 months": true, // exclusion hit
    },
  });
  assertEquals(out.match_score, "not_eligible");
  assertEquals(
    out.reasons.some((r) => r.includes("Use of insulin within 3 months")),
    true,
  );
});

Deno.test("score: excluded condition is not_eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 55,
    ecog: 0,
    conditions: ["diabetes_t2", "type_1_diabetes"],
    custom_answers: {},
  });
  assertEquals(out.match_score, "not_eligible");
});

Deno.test("score: missing custom answer is possibly_eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 55,
    ecog: 0,
    conditions: ["diabetes_t2"],
    custom_answers: {
      "HbA1c between 7.0% and 10.5%": true,
      // BMI + metformin unanswered → unknown
    },
  });
  assertEquals(out.match_score, "possibly_eligible");
});

Deno.test("score: out-of-range age (no exclusion) is not_eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 80,
    ecog: 0,
    conditions: ["diabetes_t2"],
    custom_answers: {
      "HbA1c between 7.0% and 10.5%": true,
      "BMI between 25 and 40": true,
      "On stable metformin dose for 3+ months": true,
    },
  });
  assertEquals(out.match_score, "not_eligible");
});

Deno.test("score: missing required condition is not_eligible", () => {
  const out = score(criteria, {
    trial_id: "diabetes-prevention",
    age: 55,
    ecog: 0,
    conditions: ["hypertension"],
    custom_answers: {
      "HbA1c between 7.0% and 10.5%": true,
      "BMI between 25 and 40": true,
      "On stable metformin dose for 3+ months": true,
    },
  });
  assertEquals(out.match_score, "not_eligible");
});

Deno.test("fetchCriteria returns the first row, or null on empty", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("trial_id=eq.diabetes-prevention")) {
      return Promise.resolve(new Response(JSON.stringify([criteria]), { status: 200 }));
    }
    return Promise.resolve(new Response("[]", { status: 200 }));
  }) as typeof fetch;
  try {
    const found = await fetchCriteria("diabetes-prevention", env);
    assertEquals(found?.inclusion.age_min, 30);
    const missing = await fetchCriteria("nope", env);
    assertEquals(missing, null);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("handle returns 404 when no criteria row exists", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("[]", { status: 200 }))) as typeof fetch;
  try {
    const req = new Request("http://localhost/eligibility-check", {
      method: "POST",
      body: JSON.stringify({ trial_id: "nope" }),
    });
    const res = await handle(req, env);
    assertEquals(res.status, 404);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("handle scores against fetched criteria", async () => {
  const original = globalThis.fetch;
  globalThis.fetch =
    (() =>
      Promise.resolve(new Response(JSON.stringify([criteria]), { status: 200 }))) as typeof fetch;
  try {
    const req = new Request("http://localhost/eligibility-check", {
      method: "POST",
      body: JSON.stringify({
        trial_id: "diabetes-prevention",
        age: 55,
        ecog: 0,
        conditions: ["diabetes_t2"],
        custom_answers: {
          "HbA1c between 7.0% and 10.5%": true,
          "BMI between 25 and 40": true,
          "On stable metformin dose for 3+ months": true,
        },
      }),
    });
    const res = await handle(req, env);
    const json = await res.json();
    assertEquals(json.match_score, "eligible");
  } finally {
    globalThis.fetch = original;
  }
});
