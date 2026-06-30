import { showAbout } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const ctx = buildCtx();
  const result = (await showAbout(ctx)) as {
    mission: string;
    partnerships: string[];
    contact: string;
    therapies: Array<{ topic: string; description: string }>;
  };

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">About BioNova</h1>
      {result.mission ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Mission</h2>
          <p className="text-sm leading-relaxed">{result.mission}</p>
        </section>
      ) : null}
      {result.partnerships?.length ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Partnerships</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.partnerships.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {result.therapies?.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Therapies</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {result.therapies.map((t) => (
              <Card key={t.topic}>
                <CardHeader>
                  <CardTitle>{t.topic}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      {result.contact ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Contact</h2>
          <p className="text-sm">{result.contact}</p>
        </section>
      ) : null}
    </main>
  );
}
