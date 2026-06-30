import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { listSites } from "../src/index.js";
import { makeFetch, jsonResponse, route } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

const sites = [
  { id: "site-1", name: "North Clinic", address: "1 St", city: "Boston", state: "MA", country: "USA", org_ref: "org-1", capacity: 50, specialties: ["oncology"] },
  { id: "site-2", name: "South Clinic", address: "2 St", city: "Miami", state: "FL", country: "USA", org_ref: "org-2", capacity: 30, specialties: ["endocrinology"] },
];

test("listSites attaches descriptions to every site", async () => {
  const { fetchImpl } = makeFetch([
    route("site_descriptions?select", [{ site_id: "site-1", description: "Large oncology center." }]),
    route("sites?select", sites),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await listSites({ data, args: {}, options: {} });

  expect(res.sites.length).toBe(2);
  expect(res.sites[0].description).toBe("Large oncology center.");
  expect(res.sites[1].description).toBe(null);
});

test("listSites passes a specialty containment filter to PostgREST", async () => {
  let sitesUrl = "";
  const fetchImpl = (url) => {
    if (url.includes("site_descriptions")) return Promise.resolve(jsonResponse([]));
    if (url.includes("sites?")) {
      sitesUrl = url;
      return Promise.resolve(jsonResponse([sites[0]]));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await listSites({ data, args: {}, options: { specialty: "oncology" } });

  expect(sitesUrl).toContain("specialties=cs.");
  expect(res.sites[0].specialties).toContain("oncology");
});

test("listSites result carries no PII (no email)", async () => {
  const { fetchImpl } = makeFetch([
    route("site_descriptions?select", []),
    route("sites?select", sites),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await listSites({ data, args: {}, options: {} });
  expect(JSON.stringify(res).includes("email")).toBe(false);
});
