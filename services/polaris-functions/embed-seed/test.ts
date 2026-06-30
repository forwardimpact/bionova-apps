// Pure unit tests for embed-seed. Mocks globalThis.fetch so no live TEI or
// PostgREST is needed. Runner-independent: uses Deno.test only.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { embedOne, handle, parseJsonl, upsertEmbedding } from "./mod.ts";
import type { Env } from "../env.ts";

const env: Env = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  TEI_URL: "http://tei:80",
  PGREST_URL: "http://kong:8000/rest/v1",
};

const vec384 = new Array(384).fill(0).map((_, i) => i / 384);

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const original = globalThis.fetch;
  globalThis.fetch =
    ((input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(handler(String(input), init))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("parseJsonl skips blank lines", () => {
  const raw =
    '{"id":"a","table":"conditions","text":"x"}\n\n{"id":"b","table":"trials","text":"y"}\n';
  const rows = parseJsonl(raw);
  assertEquals(rows.length, 2);
  assertEquals(rows[0].id, "a");
});

Deno.test("embedOne returns the first row of the 2D TEI response", async () => {
  const restore = fakeFetch((url) => {
    assertEquals(url, "http://tei:80/embed");
    return new Response(JSON.stringify([vec384]), { status: 200 });
  });
  try {
    const out = await embedOne("hello", env.TEI_URL);
    assertEquals(out.length, 384);
    assertEquals(out, vec384);
  } finally {
    restore();
  }
});

Deno.test("embedOne throws on unexpected TEI shape", async () => {
  const restore = fakeFetch(() => new Response(JSON.stringify({ error: "nope" }), { status: 200 }));
  try {
    let threw = false;
    try {
      await embedOne("hello", env.TEI_URL);
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  } finally {
    restore();
  }
});

Deno.test("upsertEmbedding posts with on_conflict + merge headers", async () => {
  let seenUrl = "";
  let seenPrefer = "";
  let seenBody = "";
  const restore = fakeFetch((url, init) => {
    seenUrl = url;
    seenPrefer = String((init?.headers as Record<string, string>)?.Prefer);
    seenBody = String(init?.body);
    return new Response("", { status: 201 });
  });
  try {
    await upsertEmbedding("lung-cancer", vec384, env);
    assertEquals(seenUrl, "http://kong:8000/rest/v1/condition_embeddings?on_conflict=condition_id");
    assertEquals(seenPrefer, "resolution=merge-duplicates,return=minimal");
    const body = JSON.parse(seenBody);
    assertEquals(body.condition_id, "lung-cancer");
    assertEquals(body.embedding.length, 384);
  } finally {
    restore();
  }
});

Deno.test("handle embeds only conditions rows and reports counts", async () => {
  const jsonl = [
    '{"id":"lung-cancer","table":"conditions","text":"NSCLC"}',
    '{"id":"diabetes-t2","table":"conditions","text":"T2D"}',
    '{"id":"oncora-phase3","table":"trials","text":"trial prose"}',
  ].join("\n");

  // Stub Deno.readTextFile so the test needs no --allow-write / disk fixture.
  const origReadText = Deno.readTextFile;
  // deno-lint-ignore no-explicit-any
  (Deno as any).readTextFile = (p: string | URL) => {
    assertEquals(String(p), "/data/synthetic/seed_embeddings.jsonl");
    return Promise.resolve(jsonl);
  };

  let upserts = 0;
  let embeds = 0;
  const restore = fakeFetch((url) => {
    if (url.endsWith("/embed")) {
      embeds++;
      return new Response(JSON.stringify([vec384]), { status: 200 });
    }
    upserts++;
    return new Response("", { status: 201 });
  });
  try {
    const req = new Request("http://localhost/embed-seed", {
      method: "POST",
      body: JSON.stringify({}), // default source path
    });
    const res = await handle(req, env);
    const json = await res.json();
    assertEquals(json, { seeded: 2, skipped: 1 });
    assertEquals(embeds, 2);
    assertEquals(upserts, 2);
  } finally {
    restore();
    // deno-lint-ignore no-explicit-any
    (Deno as any).readTextFile = origReadText;
  }
});
