import { NextResponse, type NextRequest } from "next/server";
import { listSites } from "@bionova/polaris-handlers";
import { buildCtxFromRequest } from "@/lib/build-ctx";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(await listSites(buildCtxFromRequest(request)));
}
