import { searchTrials } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { SearchForm } from "@/components/search-form";
import { TrialCard } from "@/components/trial-card";
import type { TrialSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = buildCtx(searchParams);
  const result = (await searchTrials(ctx)) as {
    trials: TrialSummary[];
    total: number;
  };

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Trial search</h1>
      <SearchForm initialValues={ctx.options} />
      <p className="text-sm text-muted-foreground">
        {result.total} trial{result.total === 1 ? "" : "s"} found
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {result.trials.map((t) => (
          <li key={t.id}>
            <TrialCard trial={t} />
          </li>
        ))}
      </ul>
    </main>
  );
}
