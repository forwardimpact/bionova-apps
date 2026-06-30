// embed-seed — invoked once by setup.sh. Reads the rendered seed embeddings
// JSONL, embeds each condition's prose via TEI, and upserts the 384-dim vector
// into condition_embeddings via PostgREST. Idempotent: the upsert targets the
// condition_embeddings_condition_id_uidx unique index (part 02).

import type { Env } from "../env.ts";

const DEFAULT_SOURCE = "/data/synthetic/seed_embeddings.jsonl";

type SeedRow = { id: string; table: string; text: string };
type EmbedSeedRequest = { source?: string };
type EmbedSeedResponse = { seeded: number; skipped: number };

// Embeds one text through TEI. The /embed endpoint returns a 2D array
// [[...384 floats...]] when given a single-element inputs array.
export async function embedOne(text: string, teiUrl: string): Promise<number[]> {
  const r = await fetch(`${teiUrl}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputs: [text] }),
  });
  if (!r.ok) {
    throw new Error(`TEI /embed returned ${r.status}: ${(await r.text()).slice(0, 120)}`);
  }
  const arr = await r.json();
  if (!Array.isArray(arr) || !Array.isArray(arr[0])) {
    throw new Error(`TEI returned unexpected shape: ${JSON.stringify(arr).slice(0, 80)}`);
  }
  return arr[0] as number[];
}

// Upserts one embedding via PostgREST, keyed on condition_id.
// condition_embeddings.id is a NOT NULL text PRIMARY KEY with no default, so the
// insert side must supply it; the embedding row id is the condition id (one
// embedding per condition). The unique index on condition_id drives the upsert.
export async function upsertEmbedding(
  conditionId: string,
  embedding: number[],
  env: Env,
): Promise<void> {
  const r = await fetch(`${env.PGREST_URL}/condition_embeddings?on_conflict=condition_id`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: conditionId, condition_id: conditionId, embedding }),
  });
  if (!r.ok) {
    throw new Error(
      `PostgREST upsert for ${conditionId} returned ${r.status}: ${(await r.text()).slice(0, 120)}`,
    );
  }
}

// Parses JSONL text into seed rows, skipping blank lines.
export function parseJsonl(raw: string): SeedRow[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as SeedRow);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  let body: EmbedSeedRequest = {};
  if (req.body) {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text) as EmbedSeedRequest;
  }
  // The function runs with the service-role key and --allow-read; do NOT let a
  // request-supplied path turn it into an arbitrary file-read primitive. A
  // caller may only point at the mounted seed dir; anything else falls back to
  // the default. (setup.sh passes the default path.)
  const requested = body.source ?? DEFAULT_SOURCE;
  const source = requested.startsWith("/data/synthetic/") ? requested : DEFAULT_SOURCE;
  const rows = parseJsonl(await Deno.readTextFile(source));

  let seeded = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.table !== "conditions") {
      skipped++;
      continue;
    }
    const vec = await embedOne(row.text, env.TEI_URL);
    await upsertEmbedding(row.id, vec, env);
    seeded++;
  }

  const result: EmbedSeedResponse = { seeded, skipped };
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
