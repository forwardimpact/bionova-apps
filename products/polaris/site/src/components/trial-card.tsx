import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TrialSummary } from "@/lib/types";

export function TrialCard({ trial }: { trial: TrialSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={`/trials/${trial.id}`} className="hover:underline">
            {trial.name}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
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
        {trial.conditions.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Conditions: {trial.conditions.map((c) => c.name).join(", ")}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {trial.sites_count} site{trial.sites_count === 1 ? "" : "s"}
        </p>
      </CardContent>
    </Card>
  );
}
