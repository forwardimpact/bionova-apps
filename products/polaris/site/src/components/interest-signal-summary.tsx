import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignalSummary } from "@/lib/types";

const rows: Array<{ key: keyof SignalSummary; label: string }> = [
  { key: "eligible", label: "Likely eligible" },
  { key: "possibly_eligible", label: "Possibly eligible" },
  { key: "not_eligible", label: "Not eligible" },
  { key: "total", label: "Total signals" },
];

export function InterestSignalSummary({ signals }: { signals: SignalSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interest signals</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {rows.map((r) => (
            <div key={r.key} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="font-medium tabular-nums">{signals[r.key]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
