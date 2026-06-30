// Pure unit tests for sync-listings SQL parsing and dry_run behaviour. Uses
// verbatim fragments of the rendered seed SQL as fixtures so the parser is
// tested against the real generator output shape.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handle, parseInserts, type SyncResponse } from "./mod.ts";
import type { Env } from "../env.ts";

const env: Env = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  TEI_URL: "http://tei:80",
  PGREST_URL: "http://kong:8000/rest/v1",
};

// Note: \$ escapes are required so the JS template literal does not treat the
// SQL dollar-quote `$${` as a `${...}` interpolation. They render as plain `$`.
const TRIALS_SQL = `CREATE TABLE IF NOT EXISTS "trials" ("id" text PRIMARY KEY);

INSERT INTO "trials" ("id", "name", "phase", "project_ref", "status", "target_enrollment", "current_enrollment", "start_date", "arms", "principal_investigator_id") VALUES
(\$\$oncora-phase3\$\$, \$\$ONCORA-301\$\$, \$\$Phase 3\$\$, \$\$oncora\$\$, \$\$recruiting\$\$, 450, 287, '2024-06-01', ARRAY['mAb + SoC', 'placebo + SoC'], \$\$thoth\$\$),
(\$\$cardio-outcomes\$\$, \$\$CARDIO-301\$\$, \$\$Phase 3\$\$, NULL, \$\$recruiting\$\$, 600, 342, '2024-03-01', ARRAY['BNV-CRD01 10mg', 'BNV-CRD01 25mg', 'placebo'], \$\$chronos\$\$);
`;

const CRITERIA_SQL = `CREATE TABLE IF NOT EXISTS "criteria" ("trial_id" text PRIMARY KEY);

INSERT INTO "criteria" ("trial_id", "inclusion", "exclusion") VALUES
(\$\$diabetes-prevention\$\$, \$\$\{"age_min":30,"age_max":70,"conditions_required":["diabetes_t2"],"ecog_max":1,"custom":["HbA1c between 7.0% and 10.5%","BMI between 25 and 40","On stable metformin dose for 3+ months"]\}\$\$::jsonb, \$\$\{"conditions_excluded":["type_1_diabetes","gestational_diabetes"],"active_autoimmune":false,"prior_immunotherapy":false,"custom":["eGFR below 45 mL/min","History of diabetic ketoacidosis","Use of insulin within 3 months"]\}\$\$::jsonb);
`;

Deno.test("parseInserts: trials rows with dollar-quotes, NULL, ARRAY, dates, ints", () => {
  const out = parseInserts(TRIALS_SQL, "trials");
  assertEquals(out.rows.length, 2);

  const r0 = out.rows[0];
  assertEquals(r0.id, "oncora-phase3");
  assertEquals(r0.name, "ONCORA-301");
  assertEquals(r0.target_enrollment, 450);
  assertEquals(r0.current_enrollment, 287);
  assertEquals(r0.start_date, "2024-06-01");
  assertEquals(r0.arms, ["mAb + SoC", "placebo + SoC"]);
  assertEquals(r0.principal_investigator_id, "thoth");

  const r1 = out.rows[1];
  assertEquals(r1.id, "cardio-outcomes");
  assertEquals(r1.project_ref, null); // NULL → null
  assertEquals(r1.arms, ["BNV-CRD01 10mg", "BNV-CRD01 25mg", "placebo"]);
});

Deno.test("parseInserts: criteria jsonb is parsed into objects", () => {
  const out = parseInserts(CRITERIA_SQL, "criteria");
  assertEquals(out.rows.length, 1);
  const row = out.rows[0] as {
    trial_id: string;
    inclusion: { age_min: number; conditions_required: string[]; custom: string[] };
    exclusion: { conditions_excluded: string[]; custom: string[] };
  };
  assertEquals(row.trial_id, "diabetes-prevention");
  assertEquals(row.inclusion.age_min, 30);
  assertEquals(row.inclusion.conditions_required, ["diabetes_t2"]);
  assertEquals(row.exclusion.conditions_excluded, ["type_1_diabetes", "gestational_diabetes"]);
  assertEquals(row.exclusion.custom[2], "Use of insulin within 3 months");
});

// In-memory fixture for /data/migrations. Stubs Deno.readDir / readTextFile so
// the tests need no --allow-write and no on-disk fixtures.
const FILES: Record<string, string> = {
  "/data/migrations/202501010004_seed_004_trials.sql": TRIALS_SQL,
  "/data/migrations/202501010005_seed_005_criteria.sql": CRITERIA_SQL,
};

function stubFs(): () => void {
  const origReadDir = Deno.readDir;
  const origReadText = Deno.readTextFile;
  // deno-lint-ignore no-explicit-any
  (Deno as any).readDir = (p: string | URL) => {
    assertEquals(String(p), "/data/migrations");
    const entries = Object.keys(FILES).map((path) => ({
      name: path.split("/").pop()!,
      isFile: true,
      isDirectory: false,
      isSymlink: false,
    }));
    return (async function* () {
      for (const e of entries) yield e as Deno.DirEntry;
    })();
  };
  // deno-lint-ignore no-explicit-any
  (Deno as any).readTextFile = (p: string | URL) => {
    const text = FILES[String(p)];
    if (text === undefined) throw new Error(`unexpected read: ${p}`);
    return Promise.resolve(text);
  };
  return () => {
    // deno-lint-ignore no-explicit-any
    (Deno as any).readDir = origReadDir;
    // deno-lint-ignore no-explicit-any
    (Deno as any).readTextFile = origReadText;
  };
}

Deno.test("handle dry_run parses files without any PostgREST writes", async () => {
  const restoreFs = stubFs();
  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("", { status: 201 }));
  }) as typeof fetch;

  try {
    const req = new Request("http://localhost/sync-listings", {
      method: "POST",
      body: JSON.stringify({ dry_run: true }),
    });
    const res = await handle(req, env);
    const json = (await res.json()) as SyncResponse;
    assertEquals(json, { trials_upserted: 2, criteria_upserted: 1, dry_run: true });
    assertEquals(fetchCalled, false); // dry_run does no writes
  } finally {
    globalThis.fetch = origFetch;
    restoreFs();
  }
});

Deno.test("handle wet run upserts to PostgREST", async () => {
  const restoreFs = stubFs();
  const origFetch = globalThis.fetch;
  const posted: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    posted.push(String(input));
    return Promise.resolve(new Response("", { status: 201 }));
  }) as typeof fetch;

  try {
    const req = new Request("http://localhost/sync-listings", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await handle(req, env);
    const json = (await res.json()) as SyncResponse;
    assertEquals(json.dry_run, false);
    assertEquals(posted.length, 2);
    assertEquals(posted[0].includes("/trials?on_conflict=id"), true);
    assertEquals(posted[1].includes("/criteria?on_conflict=trial_id"), true);
  } finally {
    globalThis.fetch = origFetch;
    restoreFs();
  }
});
