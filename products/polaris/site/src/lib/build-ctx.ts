import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { freezeInvocationContext } from "@forwardimpact/libui";
import { createDataContext } from "@bionova/polaris-handlers/context";

const STAFF_JWT_COOKIE = "sb-staff-jwt";

type SearchParams = Record<string, string | string[] | undefined>;
type Args = Record<string, string>;

function env() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    TEI_URL: process.env.TEI_URL!,
  };
}

// Next 14 may pass array values when the same key appears multiple times.
// Handlers expect scalar options; collapse arrays to their first value.
export function collapse(searchParams: SearchParams): Record<string, string> {
  const options: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") options[k] = v;
    else if (Array.isArray(v) && v.length > 0) options[k] = v[0];
  }
  return options;
}

// Page Server Components (anon read; no staff JWT).
export function buildCtx(searchParams: SearchParams = {}, args: Args = {}) {
  return freezeInvocationContext({
    data: createDataContext(env()),
    args,
    options: collapse(searchParams),
  });
}

// Admin page Server Components. The staff JWT lives in the `sb-staff-jwt`
// cookie; when absent, `ctx.data.token` is undefined and `manageTrial` throws
// its documented precondition rather than performing an anon PATCH.
export function buildAdminCtx(searchParams: SearchParams = {}, args: Args = {}) {
  const token = cookies().get(STAFF_JWT_COOKIE)?.value;
  return freezeInvocationContext({
    data: createDataContext(env(), { token }),
    args,
    options: collapse(searchParams),
  });
}

// Route Handlers (`src/app/api/**`). Reads the same staff cookie when present
// so an authenticated session hits `/api/*` with the staff role; anon clients
// get anon-role data.
export function buildCtxFromRequest(request: NextRequest, args: Args = {}) {
  const searchParams = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const token = request.cookies.get(STAFF_JWT_COOKIE)?.value;
  return freezeInvocationContext({
    data: createDataContext(env(), { token }),
    args,
    options: collapse(searchParams),
  });
}
