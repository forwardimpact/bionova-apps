import { NextResponse, type NextRequest } from "next/server";
import { checkEligibility } from "@bionova/polaris-handlers";
import { freezeInvocationContext } from "@forwardimpact/libui";
import { createDataContext } from "@bionova/polaris-handlers/context";
import { ANSWER_PREFIX } from "@/components/eligibility-screener";

export const dynamic = "force-dynamic";

// Anon key only — this public POST records an anonymous interest signal and
// never needs the RLS-bypassing service-role key. Kept out of the request path
// deliberately so it cannot leak.
function env() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    TEI_URL: process.env.TEI_URL!,
  };
}

// The screener posts each answer as `answer:<verbatim criterion text>` with a
// "true"/"false" value. checkEligibility spreads `ctx.options` into the edge
// function body, which scores against `custom_answers` keyed by that exact
// text — so we rebuild that map here and pass it as the single option.
//
// This POST lives in a `submit/` child segment because a Next 14 App Router
// segment cannot expose both a `page.tsx` (the screener form, GET) and a
// `route.ts` (this POST) at the same path. The form action targets this child
// route and we redirect back to the parent screener page with the score.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const form = await request.formData();
  const custom_answers: Record<string, boolean> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith(ANSWER_PREFIX)) {
      custom_answers[key.slice(ANSWER_PREFIX.length)] = value === "true";
    }
  }

  const ctx = freezeInvocationContext({
    data: createDataContext(env()),
    args: { id },
    options: { custom_answers } as unknown as Record<string, string>,
  });

  const result = (await checkEligibility(ctx)) as { match_score: string };
  const score = result.match_score;

  // Keep the browser on the public origin the patient is using. `request.url`
  // is the container bind host (Next binds 0.0.0.0:3000 in the standalone
  // image, per the Dockerfile), so it must never be the redirect base — that
  // is what dead-ends the browser on an unreachable internal address. When an
  // operator pins a public origin we build an absolute Location against it;
  // otherwise we emit a relative Location, which the browser resolves against
  // the origin it actually requested (RFC 7231 §7.1.2). We never echo a
  // client-settable forwarded header such as X-Forwarded-Host, which would
  // open a host-poisoning redirect.
  const path = `/trials/${id}/eligibility?score=${encodeURIComponent(score)}`;
  const base = process.env.POLARIS_SITE_URL;
  const location = base ? new URL(path, base).toString() : path;
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}
