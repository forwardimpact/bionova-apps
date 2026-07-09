import Link from "next/link";
import { manageTrial } from "@bionova/polaris-handlers";
import { buildAdminCtx } from "@/lib/build-ctx";
import { AdminSidebar } from "@/components/admin-sidebar";
import { InterestSignalSummary } from "@/components/interest-signal-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignalSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminTrialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await buildAdminCtx({}, { id });

  let result: { trial: any; signals: SignalSummary } | null = null;
  let unauthorized = false;
  try {
    result = (await manageTrial(ctx)) as { trial: any; signals: SignalSummary };
  } catch (err) {
    // manageTrial throws its documented precondition when no staff JWT is
    // present (cookie absent). Render the unauthorized state rather than a
    // 500 — the staff login flow sets `sb-staff-jwt`.
    if (err instanceof Error && err.message.includes("staff JWT")) {
      unauthorized = true;
    } else {
      throw err;
    }
  }

  if (unauthorized || !result) {
    return (
      <main className="space-y-3">
        <h1 className="text-2xl font-bold">Staff access required</h1>
        <p className="text-sm text-muted-foreground">
          This trial console is staff-only. Sign in to continue.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Go to staff sign-in
        </Link>
      </main>
    );
  }

  const { trial, signals } = result;

  return (
    <main className="flex gap-6">
      <AdminSidebar trialId={id} />
      <div className="flex-1 space-y-6">
        <h1 className="text-2xl font-bold">
          {trial?.name ?? id}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (staff)
          </span>
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Trial status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Status: {trial?.status ?? "—"}</p>
            <p>
              Enrollment: {trial?.current_enrollment ?? 0} /{" "}
              {trial?.target_enrollment ?? "—"}
            </p>
          </CardContent>
        </Card>
        <InterestSignalSummary signals={signals} />
      </div>
    </main>
  );
}
