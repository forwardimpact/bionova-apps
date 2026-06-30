import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { showCondition } from "../src/index.js";
import { makeFetch, route } from "./helpers.js";
import { readFileSync } from "node:fs";

const seedCondition = JSON.parse(
  readFileSync(new URL("./fixtures/seed-condition.json", import.meta.url), "utf-8"),
);

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

test("showCondition returns the condition and its explainer", async () => {
  const { fetchImpl } = makeFetch([
    route("condition_explainers?condition_id", [{ explainer: "Type 2 diabetes means..." }]),
    route("conditions?id", [seedCondition]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await showCondition({ data, args: { id: "diabetes-t2" }, options: {} });

  expect(res.condition.id).toBe("diabetes-t2");
  expect(res.condition.synonyms).toContain("high blood sugar");
  expect(res.explainer).toMatch(/Type 2 diabetes/);
});

test("showCondition returns null explainer when absent", async () => {
  const { fetchImpl } = makeFetch([
    route("condition_explainers?condition_id", []),
    route("conditions?id", [seedCondition]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await showCondition({ data, args: { id: "diabetes-t2" }, options: {} });
  expect(res.explainer).toBe(null);
});
