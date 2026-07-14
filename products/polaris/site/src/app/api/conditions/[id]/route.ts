import { NextResponse, type NextRequest } from "next/server";
import { showCondition } from "@bionova/polaris-handlers";
import { buildCtxFromRequest } from "@/lib/build-ctx";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json(
    await showCondition(buildCtxFromRequest(request, { id })),
  );
}
