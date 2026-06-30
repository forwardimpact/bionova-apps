import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { showTrial } from "../src/index.js";
import { makeFetch, route } from "./helpers.js";
import { readFileSync } from "node:fs";

const seedTrial = JSON.parse(
  readFileSync(new URL("./fixtures/seed-trial.json", import.meta.url), "utf-8"),
);

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

function ctxFor() {
  const { fetchImpl } = makeFetch([
    route("criteria?trial_id", [{ inclusion: { age_min: 30, age_max: 70, custom: ["HbA1c 7-10.5%"] }, exclusion: { custom: ["eGFR below 45"] } }]),
    route("trial_sites?trial_id", [{ sites: { id: "site-1", name: "North Clinic", city: "Boston", state: "MA", country: "USA", capacity: 50, specialties: ["endocrinology"] } }]),
    route("trial_conditions?trial_id", [{ conditions: { id: "diabetes-t2", name: "Type 2 Diabetes Mellitus", severity: "chronic" } }]),
    route("researchers?id", [{ id: "res-001", name: "Dr. Vega", role: "PI", specialty: "endocrinology" }]),
    route("trial_faqs?trial_id", [{ faq: "What is involved?" }]),
    route("consent_summaries?trial_id", [{ summary: "Plain consent summary." }]),
    route("trials?id", [seedTrial]),
  ]);
  return createDataContext(env, { fetchImpl });
}

test("showTrial returns nested shape with prose fields", async () => {
  const data = ctxFor();
  const res = await showTrial({ data, args: { id: "diabetes-prevention" }, options: {} });

  expect(res.trial.id).toBe("diabetes-prevention");
  expect(res.criteria.inclusion.age_min).toBe(30);
  expect(res.criteria.exclusion.custom[0]).toMatch(/eGFR/);
  expect(res.sites[0].city).toBe("Boston");
  expect(res.conditions[0].name).toMatch(/diabetes/i);
  expect(res.principal_investigator.name).toBe("Dr. Vega");
  expect(res.faq).toBe("What is involved?");
  expect(res.consentSummary).toBe("Plain consent summary.");
});

test("showTrial result carries no PII (no email)", async () => {
  const data = ctxFor();
  const res = await showTrial({ data, args: { id: "diabetes-prevention" }, options: {} });
  expect(JSON.stringify(res).includes("email")).toBe(false);
});

test("showTrial accepts a frozen context", async () => {
  const data = ctxFor();
  const ctx = Object.freeze({ data, args: Object.freeze({ id: "diabetes-prevention" }), options: Object.freeze({}) });
  const res = await showTrial(ctx);
  expect(res.trial.name).toMatch(/Diabetes/);
});
