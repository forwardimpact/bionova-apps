import { test, expect } from "bun:test";
import { createDataContext } from "../src/context.js";
import { jsonResponse } from "./helpers.js";

const env = {
  SUPABASE_URL: "http://localhost:8000",
  SUPABASE_ANON_KEY: "anon",
  TEI_URL: "http://localhost:8080",
};

test("a transport-layer rejection is rethrown with URL, cause, and code", async () => {
  const underlying = new Error("connect ECONNREFUSED 127.0.0.1:8000");
  const fetchImpl = () => Promise.reject(underlying);
  const { db } = createDataContext(env, { fetchImpl });

  const err = await db.get("trials?select=*").then(
    () => null,
    (e) => e,
  );

  expect(err).toBeTruthy();
  expect(err.message).toContain("http://localhost:8000/rest/v1/trials?select=*");
  expect(err.code).toBe("STACK_UNREACHABLE");
  expect(err.cause).toBe(underlying);
});

test("an HTTP error response is not treated as unreachable", async () => {
  const fetchImpl = () => Promise.resolve(jsonResponse("nope", { status: 404 }));
  const { db } = createDataContext(env, { fetchImpl });

  const err = await db.get("trials?select=*").then(
    () => null,
    (e) => e,
  );

  expect(err).toBeTruthy();
  expect(err.code).toBeUndefined();
  expect(err.message).toContain("404");
});
