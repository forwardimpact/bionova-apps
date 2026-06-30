import Link from "next/link";

export function AdminSidebar({ trialId }: { trialId?: string }) {
  return (
    <aside className="w-48 shrink-0 border-r border-border pr-4">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        Staff console
      </h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link href="/search" className="hover:underline">
            All trials
          </Link>
        </li>
        {trialId ? (
          <li>
            <Link
              href={`/admin/trials/${trialId}`}
              className="font-medium hover:underline"
            >
              This trial
            </Link>
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
