// HTTP router for the Polaris edge functions. Serves on port 8000 (Kong routes
// /functions/v1/{name} here; the compose healthcheck hits /health directly).
// Dispatches /{name} to the matching module's handle(req, env) export.

import * as embedSeed from "./embed-seed/mod.ts";
import * as eligibilityCheck from "./eligibility-check/mod.ts";
import * as notifyUpdates from "./notify-updates/mod.ts";
import * as syncListings from "./sync-listings/mod.ts";
import { type Env, readEnv } from "./env.ts";

type Handler = (req: Request, env: Env) => Promise<Response>;

const handlers: Record<string, Handler> = {
  "embed-seed": embedSeed.handle,
  "eligibility-check": eligibilityCheck.handle,
  "notify-updates": notifyUpdates.handle,
  "sync-listings": syncListings.handle,
};

const env = readEnv();

Deno.serve({ port: 8000 }, async (req) => {
  // Kong forwards the full /functions/v1/{name} path; keep only the last segment.
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const name = segments[segments.length - 1] ?? "";

  if (name === "health") return new Response("ok");

  const handler = handlers[name];
  if (!handler) return new Response("Not found", { status: 404 });

  try {
    return await handler(req, env);
  } catch (err) {
    console.error(`${name} failed:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
