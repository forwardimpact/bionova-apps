import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Site } from "@/lib/types";

export function SiteList({ sites }: { sites: Site[] }) {
  if (sites.length === 0) {
    return <p className="text-sm text-muted-foreground">No sites found.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Specialties</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sites.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>
              {[s.city, s.state, s.country].filter(Boolean).join(", ")}
            </TableCell>
            <TableCell>{(s.specialties ?? []).join(", ")}</TableCell>
            <TableCell className="text-muted-foreground">
              {s.description ?? ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
