import { showCondition } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";

export const dynamic = "force-dynamic";

export default async function ConditionPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = buildCtx({}, { id: params.id });
  const result = (await showCondition(ctx)) as {
    condition: { name?: string; severity?: string } | null;
    explainer: string | null;
  };

  if (!result.condition) {
    return (
      <main>
        <p>Condition not found.</p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{result.condition.name}</h1>
      {result.condition.severity ? (
        <p className="text-sm text-muted-foreground">
          Severity: {result.condition.severity}
        </p>
      ) : null}
      {result.explainer ? (
        <div className="whitespace-pre-line text-sm leading-relaxed">
          {result.explainer}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No explainer available yet.
        </p>
      )}
    </main>
  );
}
