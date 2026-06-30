import { Badge } from "@/components/ui/badge";
import type { MatchScore } from "@/lib/types";

const styles: Record<string, string> = {
  eligible: "bg-green-100 text-green-800",
  possibly_eligible: "bg-amber-100 text-amber-800",
  not_eligible: "bg-red-100 text-red-800",
};

const labels: Record<string, string> = {
  eligible: "Likely eligible",
  possibly_eligible: "Possibly eligible",
  not_eligible: "Not eligible",
};

export function MatchScoreBadge({ score }: { score: MatchScore | string }) {
  return (
    <Badge className={styles[score] ?? "bg-muted text-muted-foreground"}>
      {labels[score] ?? score}
    </Badge>
  );
}
