// Pure unit tests for notify-updates. notifyLine is deterministic; handle is
// exercised with a mocked PostgREST fetch.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handle, type InterestSignal, notifyLine } from "./mod.ts";
import type { Env } from "../env.ts";

const env: Env = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  TEI_URL: "http://tei:80",
  PGREST_URL: "http://kong:8000/rest/v1",
};

const signal: InterestSignal = {
  id: "11111111-1111-1111-1111-111111111111",
  match_score: "eligible",
  screener_answers: {},
};

Deno.test("notifyLine is deterministic and idempotent for the same input", () => {
  const req = { trial_id: "oncora-phase3", old_status: "recruiting", new_status: "completed" };
  const a = notifyLine(req, signal);
  const b = notifyLine(req, signal);
  assertEquals(a, b);
  assertEquals(
    a,
    "would-notify signal=11111111-1111-1111-1111-111111111111 trial=oncora-phase3 status=recruiting -> completed match=eligible",
  );
});

Deno.test("handle reports notified count from interest_signals", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    assertEquals(url.includes("interest_signals?trial_id=eq.oncora-phase3"), true);
    return Promise.resolve(
      new Response(JSON.stringify([signal, { ...signal, id: "two" }]), {
        status: 200,
      }),
    );
  }) as typeof fetch;
  try {
    const req = new Request("http://localhost/notify-updates", {
      method: "POST",
      body: JSON.stringify({
        trial_id: "oncora-phase3",
        old_status: "recruiting",
        new_status: "completed",
      }),
    });
    const res = await handle(req, env);
    const json = await res.json();
    assertEquals(json, { trial_id: "oncora-phase3", notified: 2 });
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("handle 400s without a trial_id", async () => {
  const req = new Request("http://localhost/notify-updates", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const res = await handle(req, env);
  assertEquals(res.status, 400);
});
