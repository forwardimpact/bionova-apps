// Reads the four environment variables the edge functions need and fails fast
// if any is missing. The compose `polaris-functions` service sets all four
// (SUPABASE_URL=http://kong:8000, SUPABASE_SERVICE_ROLE_KEY, TEI_URL=http://tei:80,
// PGREST_URL=http://kong:8000/rest/v1).

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TEI_URL: string;
  PGREST_URL: string;
};

const KEYS: (keyof Env)[] = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEI_URL",
  "PGREST_URL",
];

export function readEnv(): Env {
  const out: Partial<Env> = {};
  const missing: string[] = [];
  for (const key of KEYS) {
    const value = Deno.env.get(key);
    if (!value) {
      missing.push(key);
      continue;
    }
    out[key] = value;
  }
  if (missing.length > 0) {
    throw new Error(`missing required env: ${missing.join(", ")}`);
  }
  return out as Env;
}

// Lazily resolved so importing a module (e.g. in tests) does not require the
// env to be present. `main.ts` calls readEnv() once at startup.
let cached: Env | null = null;
export function env(): Env {
  if (cached === null) cached = readEnv();
  return cached;
}
