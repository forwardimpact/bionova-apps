// Shared request-body helpers for the edge functions. Every function reads its
// body here so the size cap is enforced in one place. The functions sit behind
// the anon-reachable /functions/v1 route, so an uncapped read lets any caller
// pressure memory with an oversized body; the cap bounds that.

// 1 MiB. The bodies these functions accept are tiny control-plane JSON — a
// trial_id, screener answers, a dry_run flag, a source path. The bulk data
// (seed JSONL, migrations) is read from disk, never from the request. 1 MiB is
// far above any legitimate body and still a hard memory bound.
export const MAX_BODY_BYTES = 1024 * 1024;

// Thrown when a body exceeds the cap. main.ts maps this to a 413 response; every
// other error stays a generic 500.
export class BodyTooLargeError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "BodyTooLargeError";
    this.limit = limit;
  }
}

// Reads the request body as text, refusing anything larger than `limit` bytes.
// Rejects on the declared Content-Length first (cheap), then enforces the cap
// while streaming so a missing or understated Content-Length cannot slip an
// unbounded body past the check. Never buffers more than one chunk beyond the
// limit. Returns "" when there is no body.
export async function readCappedText(req: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > limit) throw new BodyTooLargeError(limit);
  }

  if (req.body === null) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new BodyTooLargeError(limit);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

// Reads and JSON-parses the request body under the same cap. Parse errors and
// an empty body surface as they did before (a thrown SyntaxError → 500).
export async function readCappedJson<T>(req: Request, limit = MAX_BODY_BYTES): Promise<T> {
  return JSON.parse(await readCappedText(req, limit)) as T;
}
