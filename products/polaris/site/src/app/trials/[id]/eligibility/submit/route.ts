import { NextResponse, type NextRequest } from "next/server";
import { checkEligibility } from "@bionova/polaris-handlers";
import { freezeInvocationContext } from "@forwardimpact/libui";
import { createDataContext } from "@bionova/polaris-handlers/context";
import { ANSWER_PREFIX } from "@/components/eligibility-screener";

export const dynamic = "force-dynamic";

function env() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  { params }: { params: { id: string } },
) {
  const form = await request.formData();
  const custom_answers: Record<string, boolean> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith(ANSWER_PREFIX)) {
      custom_answers[key.slice(ANSWER_PREFIX.length)] = value === "true";
    }
  }

  const ctx = freezeInvocationContext({
    data: createDataContext(env()),
    args: { id: params.id },
    options: { custom_answers } as unknown as Record<string, string>,
  });

  const result = (await checkEligibility(ctx)) as { match_score: string };
  const score = result.match_score;

  return NextResponse.redirect(
    new URL(
      `/trials/${params.id}/eligibility?score=${encodeURIComponent(score)}`,
      request.url,
    ),
    303,
  );
}
