// Unit tests for the shared capped body-read helpers. Runner-independent: uses
// Deno.test only. No network or disk.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BodyTooLargeError, readCappedJson, readCappedText } from "./http.ts";

function post(body: BodyInit | null): Request {
  return new Request("http://localhost/x", { method: "POST", body });
}

// A streamed body carries no Content-Length, so it exercises the streaming cap
// rather than the cheap header pre-check.
function streamed(chunks: string[]): Request {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Request("http://localhost/x", {
    method: "POST",
    body: stream,
    // Deno requires this when the body is a stream.
    // deno-lint-ignore no-explicit-any
    ...({ duplex: "half" } as any),
  });
}

async function threw(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

Deno.test("readCappedText returns a body under the limit", async () => {
  assertEquals(await readCappedText(post("hello"), 1024), "hello");
});

Deno.test("readCappedText returns empty string when there is no body", async () => {
  assertEquals(await readCappedText(post(null), 1024), "");
});

Deno.test("readCappedText rejects on declared Content-Length over the limit", async () => {
  // A string body sets Content-Length, so this trips the cheap pre-check.
  const err = await threw(() => readCappedText(post("0123456789X"), 10));
  assertEquals(err instanceof BodyTooLargeError, true);
});

Deno.test("readCappedText rejects a streamed body that exceeds the limit", async () => {
  // No Content-Length here — the cap must be enforced while streaming.
  const err = await threw(() => readCappedText(streamed(["12345", "67890", "X"]), 10));
  assertEquals(err instanceof BodyTooLargeError, true);
});

Deno.test("readCappedText accepts a streamed body at exactly the limit", async () => {
  assertEquals(await readCappedText(streamed(["12345", "67890"]), 10), "1234567890");
});

Deno.test("readCappedJson parses a body under the limit", async () => {
  const out = await readCappedJson<{ trial_id: string }>(post('{"trial_id":"t-1"}'), 1024);
  assertEquals(out.trial_id, "t-1");
});

Deno.test("readCappedJson rejects an oversized body before parsing", async () => {
  const err = await threw(() => readCappedJson(streamed(["{", '"a":"'.padEnd(20, "x"), '"}']), 10));
  assertEquals(err instanceof BodyTooLargeError, true);
});
