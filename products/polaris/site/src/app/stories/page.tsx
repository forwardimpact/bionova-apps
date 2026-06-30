import { listStories } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = buildCtx(searchParams);
  const result = (await listStories(ctx)) as {
    stories: Array<{ id: string; condition_id: string; story: string }>;
  };
  const condition =
    typeof searchParams.condition === "string"
      ? searchParams.condition
      : undefined;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Patient stories</h1>
      {condition ? (
        <p className="text-sm text-muted-foreground">
          Filtered by condition: {condition}
        </p>
      ) : null}
      {result.stories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stories found.</p>
      ) : (
        <ul className="space-y-4">
          {result.stories.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="pt-4">
                  <p className="whitespace-pre-line text-sm leading-relaxed">
                    {s.story}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.condition_id}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
