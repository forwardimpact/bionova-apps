import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { searchTrials } from "../src/index.js";
import { makeFetch, jsonResponse, route } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon", TEI_URL: "http://tei" };

const trialsRow = {
  id: "diabetes-prevention",
  name: "Diabetes Prevention Outcomes Study",
  phase: "Phase 3",
  status: "recruiting",
  therapeutic_area: "Endocrinology",
  target_enrollment: 400,
  current_enrollment: 120,
  arms: ["control"],
  trial_conditions: [{ conditions: { id: "diabetes-t2", name: "Type 2 Diabetes Mellitus" } }],
  trial_sites: [{ site_id: "site-1" }, { site_id: "site-2" }],
};

test("searchTrials catalog-id path returns shaped trials with condition names", async () => {
  const { fetchImpl } = makeFetch([
    route("trial_conditions?condition_id=in", [{ trial_id: "diabetes-prevention" }]),
    route("trials?", [trialsRow]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await searchTrials({ data, args: {}, options: { condition: "diabetes-t2" } });

  expect(res.total).toBe(1);
  expect(res.trials[0].id).toBe("diabetes-prevention");
  expect(res.trials[0].sites_count).toBe(2);
  // SC2: condition names populated.
  expect(res.trials.flatMap((t) => t.conditions).some((c) => /diabetes/i.test(c.name))).toBe(true);
  expect(res.query.condition).toBe("diabetes-t2");
});

test("searchTrials semantic path embeds and calls match_conditions RPC", async () => {
  const seen = [];
  const fetchImpl = (url) => {
    seen.push(url);
    if (url.includes("/embed")) return Promise.resolve(jsonResponse([[0.1, 0.2, 0.3]]));
    if (url.includes("rpc/match_conditions"))
      return Promise.resolve(jsonResponse([{ condition_id: "diabetes-t2", similarity: 0.45 }]));
    if (url.includes("trials?select")) return Promise.resolve(jsonResponse([trialsRow]));
    if (url.includes("trial_conditions"))
      return Promise.resolve(jsonResponse([{ trial_id: "diabetes-prevention" }]));
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await searchTrials({ data, args: {}, options: { condition: "high blood sugar" } });

  expect(seen.some((u) => u.includes("/embed"))).toBe(true);
  expect(seen.some((u) => u.includes("rpc/match_conditions"))).toBe(true);
  expect(res.trials[0].conditions[0].name).toMatch(/diabetes/i);
});

test("searchTrials falls back to ILIKE when embeddings throws", async () => {
  let rpcCalled = false;
  let catalogFetched = false;
  const fetchImpl = (url) => {
    if (url.includes("/embed")) return Promise.reject(new Error("TEI down"));
    if (url.includes("rpc/match_conditions")) {
      rpcCalled = true;
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes("conditions?select=id,name,synonyms")) {
      catalogFetched = true;
      return Promise.resolve(
        jsonResponse([
          { id: "diabetes-t2", name: "Type 2 Diabetes Mellitus", synonyms: ["high blood sugar"] },
        ]),
      );
    }
    if (url.includes("trials?select")) return Promise.resolve(jsonResponse([trialsRow]));
    if (url.includes("trial_conditions"))
      return Promise.resolve(jsonResponse([{ trial_id: "diabetes-prevention" }]));
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await searchTrials({ data, args: {}, options: { condition: "high blood sugar" } });

  expect(catalogFetched).toBe(true); // ILIKE catalog fetch happened
  expect(rpcCalled).toBe(false); // never reached the RPC after embed failed
  expect(res.total).toBe(1);
});

test("searchTrials results carry no PII (no email field)", async () => {
  const { fetchImpl } = makeFetch([
    route("trial_conditions?condition_id=in", [{ trial_id: "diabetes-prevention" }]),
    route("trials?", [trialsRow]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await searchTrials({ data, args: {}, options: { condition: "diabetes-t2" } });
  expect(JSON.stringify(res).includes("email")).toBe(false);
});

test("searchTrials handles a frozen context without mutating it", async () => {
  const { fetchImpl } = makeFetch([
    route("trial_conditions?condition_id=in", [{ trial_id: "diabetes-prevention" }]),
    route("trials?", [trialsRow]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const ctx = Object.freeze({ data, args: Object.freeze({}), options: Object.freeze({ condition: "diabetes-t2" }) });
  const res = await searchTrials(ctx);
  expect(Object.isFrozen(ctx)).toBe(true);
  expect(res.total).toBe(1);
});
