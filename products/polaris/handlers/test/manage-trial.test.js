import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { manageTrial } from "../src/index.js";
import { makeFetch, jsonResponse, route } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };
const STAFF = "staff.jwt";

const fullTrial = {
  id: "diabetes-prevention",
  name: "Diabetes Prevention Outcomes Study",
  status: "recruiting",
  phase: "Phase 3",
  current_enrollment: 120,
  target_enrollment: 400,
  criteria: [{ inclusion: {}, exclusion: {} }],
  trial_sites: [{ sites: { id: "site-1", name: "North" } }],
  trial_conditions: [{ conditions: { id: "diabetes-t2", name: "Type 2 Diabetes" } }],
};

test("manageTrial throws without a staff token", async () => {
  const data = createDataContext(env, { fetchImpl: () => Promise.reject(new Error("no net")) });
  await expect(
    manageTrial({ data: { ...data, token: undefined }, args: { id: "x" }, options: {} }),
  ).rejects.toThrow("manageTrial requires ctx.data.token");
});

test("manageTrial read mode returns trial + signal aggregate", async () => {
  const { fetchImpl } = makeFetch([
    route("interest_signals?trial_id", [
      { match_score: "eligible" },
      { match_score: "eligible" },
      { match_score: "not_eligible" },
    ]),
    route("trials?id", [fullTrial]),
  ]);
  const data = createDataContext(env, { fetchImpl, token: STAFF });
  const res = await manageTrial({ data, args: { id: "diabetes-prevention" }, options: {} });

  expect(res.trial.id).toBe("diabetes-prevention");
  expect(res.signals.eligible).toBe(2);
  expect(res.signals.not_eligible).toBe(1);
  expect(res.signals.total).toBe(3);
});

test("manageTrial patch mode allowlists keys and PATCHes with the token", async () => {
  let patchBody = null;
  let patchAuth = null;
  const fetchImpl = (url, init = {}) => {
    if (init.method === "PATCH" && url.includes("trials?id")) {
      patchBody = JSON.parse(init.body);
      patchAuth = init.headers?.Authorization;
      return Promise.resolve(jsonResponse(null, { status: 204 }));
    }
    if (url.includes("interest_signals")) return Promise.resolve(jsonResponse([]));
    if (url.includes("trials?id")) return Promise.resolve(jsonResponse([{ ...fullTrial, status: "completed" }]));
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl, token: STAFF });
  const res = await manageTrial({
    data,
    args: { id: "diabetes-prevention" },
    options: { update: JSON.stringify({ status: "completed", secret_field: "nope" }) },
  });

  expect(patchBody).toEqual({ status: "completed" }); // disallowed key dropped
  expect(patchAuth).toBe(`Bearer ${STAFF}`);
  expect(res.trial.status).toBe("completed");
});

test("manageTrial rejects an update with no allowlisted keys", async () => {
  const data = createDataContext(env, { fetchImpl: () => Promise.reject(new Error("no net")), token: STAFF });
  await expect(
    manageTrial({ data, args: { id: "x" }, options: { update: JSON.stringify({ name: "hack" }) } }),
  ).rejects.toThrow(/at least one of/);
});
