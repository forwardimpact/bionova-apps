import { NextResponse, type NextRequest } from "next/server";
import { showTrial } from "@bionova/polaris-handlers";
import { buildCtxFromRequest } from "@/lib/build-ctx";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return NextResponse.json(
    await showTrial(buildCtxFromRequest(request, { id: params.id })),
  );
}
