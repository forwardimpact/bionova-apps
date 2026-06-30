import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { listStories } from "../src/index.js";
import { makeFetch, jsonResponse } from "./helpers.js";

const env = { SUPABASE_URL: "http://kong", SUPABASE_ANON_KEY: "anon" };

const stories = [
  { id: "s1", condition_id: "diabetes-t2", story_index: 0, story: "First story." },
  { id: "s2", condition_id: "diabetes-t2", story_index: 1, story: "Second story." },
];

test("listStories returns all stories ordered by story_index", async () => {
  const { fetchImpl } = makeFetch([
    { match: (u) => u.includes("patient_stories"), respond: () => jsonResponse(stories) },
  ]);
  const data = createDataContext(env, { fetchImpl });
  const res = await listStories({ data, args: {}, options: {} });
  expect(res.stories.length).toBe(2);
  expect(res.stories[0].story_index).toBe(0);
});

test("listStories filters by condition_id when provided", async () => {
  let url = "";
  const fetchImpl = (u) => {
    url = u;
    return Promise.resolve(jsonResponse([stories[0]]));
  };
  const data = createDataContext(env, { fetchImpl });
  const res = await listStories({ data, args: {}, options: { condition: "diabetes-t2" } });
  expect(url).toContain("condition_id=eq.diabetes-t2");
  expect(url).toContain("order=story_index");
  expect(res.stories[0].condition_id).toBe("diabetes-t2");
});
