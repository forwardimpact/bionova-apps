import { listSites } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { SiteList } from "@/components/site-list";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const ctx = buildCtx(resolvedSearchParams);
  const result = (await listSites(ctx)) as { sites: Site[] };
  const specialty =
    typeof resolvedSearchParams.specialty === "string"
      ? resolvedSearchParams.specialty
      : undefined;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Trial sites</h1>
      <form method="get" className="flex items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="specialty" className="text-sm font-medium">
            Filter by specialty
          </label>
          <input
            id="specialty"
            name="specialty"
            defaultValue={specialty ?? ""}
            placeholder="e.g. oncology"
            className="flex h-10 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
      </form>
      <SiteList sites={result.sites} />
    </main>
  );
}
