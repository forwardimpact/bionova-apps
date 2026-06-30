import Link from "next/link";
import { showTrial } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function TrialPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = buildCtx({}, { id: params.id });
  const result = (await showTrial(ctx)) as any;
  const { trial, criteria, sites, conditions, principal_investigator, faq, consentSummary } =
    result;

  if (!trial) {
    return <main><p>Trial not found.</p></main>;
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{trial.name}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          {trial.phase ? (
            <Badge className="bg-muted text-muted-foreground">
              Phase {trial.phase}
            </Badge>
          ) : null}
          {trial.status ? (
            <Badge className="bg-primary text-primary-foreground">
              {trial.status}
            </Badge>
          ) : null}
        </div>
        <Link href={`/trials/${trial.id}/eligibility`}>
          <Button>Check my eligibility</Button>
        </Link>
      </header>

      {conditions?.length ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Conditions</h2>
          <ul className="flex flex-wrap gap-2">
            {conditions.map((c: any) => (
              <li key={c.id}>
                <Link href={`/conditions/${c.id}`}>
                  <Badge className="bg-muted text-muted-foreground hover:underline">
                    {c.name}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {principal_investigator ? (
        <p className="text-sm text-muted-foreground">
          Principal investigator: {principal_investigator.name}
          {principal_investigator.specialty
            ? ` (${principal_investigator.specialty})`
            : ""}
        </p>
      ) : null}

      {sites?.length ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Sites</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {sites.map((s: any) => (
              <li key={s.id}>
                {s.name} — {[s.city, s.state].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {criteria?.inclusion || criteria?.exclusion ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Inclusion</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {(criteria.inclusion?.custom ?? []).map((c: string) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Exclusion</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {(criteria.exclusion?.custom ?? []).map((c: string) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {faq ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Frequently asked</h2>
          <div className="whitespace-pre-line text-sm text-muted-foreground">
            {faq}
          </div>
        </section>
      ) : null}

      {consentSummary ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Consent summary</h2>
          <div className="whitespace-pre-line text-sm text-muted-foreground">
            {consentSummary}
          </div>
        </section>
      ) : null}
    </main>
  );
}
