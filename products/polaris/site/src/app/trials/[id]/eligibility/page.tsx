import { showTrial } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { EligibilityScreener } from "@/components/eligibility-screener";
import { MatchScoreBadge } from "@/components/match-score-badge";
import type { Criteria } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EligibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const ctx = buildCtx({}, { id });
  const result = (await showTrial(ctx)) as {
    trial: { name?: string } | null;
    criteria: Criteria;
  };
  const score =
    typeof resolvedSearchParams.score === "string"
      ? resolvedSearchParams.score
      : undefined;

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">
        Eligibility screener{result.trial?.name ? ` — ${result.trial.name}` : ""}
      </h1>
      {score ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-3">
          <span className="text-sm">Your result:</span>
          <MatchScoreBadge score={score} />
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Answer each question. We record only your answers and the result — never
        any identifying information.
      </p>
      <EligibilityScreener trialId={id} criteria={result.criteria} />
    </main>
  );
}
