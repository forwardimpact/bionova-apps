import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { showAbout } from "../src/index.js";
import { parseAboutYaml } from "../src/show-about.js";
import { makeFetch, route } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

test("showAbout reads about.yaml and the therapy descriptions", async () => {
  const { fetchImpl } = makeFetch([
    route("therapy_descriptions?select", [
      { topic: "immunotherapy", description: "Trains the immune system." },
    ]),
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await showAbout({ data, args: {}, options: {} });

  expect(res.mission.length).toBeGreaterThan(0);
  expect(Array.isArray(res.partnerships)).toBe(true);
  expect(res.partnerships.length).toBe(2);
  expect(res.contact).toContain("@");
  expect(res.therapies[0].topic).toBe("immunotherapy");
});

test("parseAboutYaml handles folded mission, sequence, and scalar", () => {
  const yaml = [
    "mission: >",
    "  Line one",
    "  line two.",
    "partnerships:",
    "  - First partner line",
    "    wrapped continuation.",
    "  - Second partner.",
    "contact: hello@example.com",
  ].join("\n");
  const parsed = parseAboutYaml(yaml);
  expect(parsed.mission).toBe("Line one line two.");
  expect(parsed.partnerships.length).toBe(2);
  expect(parsed.partnerships[0]).toBe("First partner line wrapped continuation.");
  expect(parsed.contact).toBe("hello@example.com");
});
