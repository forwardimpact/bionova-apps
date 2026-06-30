// sync-listings — re-reads the staged trials/criteria seed SQL (mounted at
// /data/migrations) and upserts each row via PostgREST. Lets the seed data be
// refreshed without re-running setup.sh. Invoked by the sync-listings-daily
// pg_cron schedule or manually. Supports dry_run to report counts without writes.
//
// The SQL is generator-produced with a stable shape (see the seed_*.sql files):
//   INSERT INTO "trials" ("id", "name", ...) VALUES
//   ($$id$$, $$name$$, 450, '2024-06-01', ARRAY['a', 'b'], NULL, $${...}$$::jsonb),
//   ...;
// We parse it directly rather than shelling out to a SQL engine.

import type { Env } from "../env.ts";

const MIGRATIONS_DIR = "/data/migrations";
const TRIALS_GLOB = /_seed_004_trials\.sql$/;
const CRITERIA_GLOB = /_seed_005_criteria\.sql$/;

export type SyncRequest = { dry_run?: boolean };
export type SyncResponse = {
  trials_upserted: number;
  criteria_upserted: number;
  dry_run: boolean;
};

export type ParsedInsert = {
  table: string;
  rows: Record<string, unknown>[];
};

// Splits a delimited string at top level, honouring $$ dollar-quotes, '
// single-quotes, parentheses, and square brackets (ARRAY[...]). Used both for
// rows (delimiter at depth 0 between ")(" boundaries) and for values within a row.
function splitTopLevel(s: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depthParen = 0;
  let depthBracket = 0;
  let inDollar = false;
  let inSingle = false;
  let buf = "";

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const two = s.slice(i, i + 2);

    if (inDollar) {
      if (two === "$$") {
        inDollar = false;
        buf += two;
        i++;
        continue;
      }
      buf += ch;
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        // Doubled '' is an escaped quote inside the string.
        if (s[i + 1] === "'") {
          buf += "''";
          i++;
          continue;
        }
        inSingle = false;
      }
      buf += ch;
      continue;
    }

    if (two === "$$") {
      inDollar = true;
      buf += two;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === "(") depthParen++;
    if (ch === ")") depthParen--;
    if (ch === "[") depthBracket++;
    if (ch === "]") depthBracket--;

    if (ch === delimiter && depthParen === 0 && depthBracket === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) parts.push(buf);
  return parts;
}

// Converts one SQL scalar literal into a JS value suitable for a PostgREST body.
function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "NULL" || v === "null") return null;

  // Dollar-quoted string, optionally cast: $$...$$  or  $$...$$::jsonb
  if (v.startsWith("$$")) {
    const end = v.indexOf("$$", 2);
    const inner = v.slice(2, end);
    const cast = v.slice(end + 2).trim();
    if (cast.startsWith("::jsonb") || cast.startsWith("::json")) {
      return JSON.parse(inner);
    }
    return inner;
  }

  // Single-quoted string (dates etc.), un-escaping doubled quotes.
  if (v.startsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'");
  }

  // ARRAY['a', 'b'] → string[]
  if (v.startsWith("ARRAY[")) {
    const inner = v.slice("ARRAY[".length, v.lastIndexOf("]"));
    if (inner.trim().length === 0) return [];
    return splitTopLevel(inner, ",").map((el) => {
      const t = el.trim();
      if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
      if (t.startsWith("$$")) return t.slice(2, t.indexOf("$$", 2));
      return t;
    });
  }

  // Numeric.
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);

  return v;
}

// Parses every INSERT statement for `table` out of a SQL file's text.
export function parseInserts(sql: string, table: string): ParsedInsert {
  const rows: Record<string, unknown>[] = [];
  // Match: INSERT INTO "table" (cols) VALUES <body> ;
  const re = new RegExp(
    `INSERT\\s+INTO\\s+"${table}"\\s*\\(([^)]*)\\)\\s*VALUES\\s*([\\s\\S]*?);`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const cols = m[1]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const body = m[2].trim();

    // Split the VALUES body into individual "(...)" tuples. Strip the outer
    // parens, then split between tuples on the "),(" boundary using depth.
    for (const tuple of splitTuples(body)) {
      const values = splitTopLevel(tuple, ",").map(parseValue);
      const row: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        row[col] = values[i];
      });
      rows.push(row);
    }
  }
  return { table, rows };
}

// Splits a VALUES body "(...),(...),(...)" into the inner content of each tuple.
function splitTuples(body: string): string[] {
  const tuples: string[] = [];
  let depthParen = 0;
  let depthBracket = 0;
  let inDollar = false;
  let inSingle = false;
  let buf = "";
  let started = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const two = body.slice(i, i + 2);

    if (inDollar) {
      if (two === "$$") {
        inDollar = false;
        buf += two;
        i++;
        continue;
      }
      buf += ch;
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        if (body[i + 1] === "'") {
          buf += "''";
          i++;
          continue;
        }
        inSingle = false;
      }
      buf += ch;
      continue;
    }
    if (two === "$$") {
      inDollar = true;
      buf += two;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === "[") depthBracket++;
    if (ch === "]") depthBracket--;

    if (ch === "(" && depthBracket === 0) {
      depthParen++;
      if (depthParen === 1) {
        started = true;
        buf = "";
        continue; // drop the opening paren
      }
    }
    if (ch === ")" && depthBracket === 0) {
      depthParen--;
      if (depthParen === 0 && started) {
        tuples.push(buf);
        started = false;
        continue; // drop the closing paren
      }
    }
    if (started) buf += ch;
  }
  return tuples;
}

// Upserts a batch of rows into one table via PostgREST, keyed on `onConflict`.
export async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  env: Env,
): Promise<void> {
  if (rows.length === 0) return;
  const r = await fetch(`${env.PGREST_URL}/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    throw new Error(
      `PostgREST upsert into ${table} returned ${r.status}: ${(await r.text()).slice(0, 120)}`,
    );
  }
}

// Finds the newest matching seed file in the migrations dir and returns its text.
async function readMatching(re: RegExp, dir: string): Promise<string> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && re.test(entry.name)) names.push(entry.name);
  }
  names.sort();
  if (names.length === 0) throw new Error(`no seed file matching ${re} in ${dir}`);
  return await Deno.readTextFile(`${dir}/${names[names.length - 1]}`);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  let body: SyncRequest = {};
  if (req.body) {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text) as SyncRequest;
  }
  const dryRun = body.dry_run === true;

  const trialsSql = await readMatching(TRIALS_GLOB, MIGRATIONS_DIR);
  const criteriaSql = await readMatching(CRITERIA_GLOB, MIGRATIONS_DIR);

  const trials = parseInserts(trialsSql, "trials");
  const criteria = parseInserts(criteriaSql, "criteria");

  if (!dryRun) {
    await upsertRows("trials", trials.rows, "id", env);
    await upsertRows("criteria", criteria.rows, "trial_id", env);
  }

  const result: SyncResponse = {
    trials_upserted: trials.rows.length,
    criteria_upserted: criteria.rows.length,
    dry_run: dryRun,
  };
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
