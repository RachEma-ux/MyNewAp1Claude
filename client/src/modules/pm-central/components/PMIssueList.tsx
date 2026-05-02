/**
 * PMIssueList — issues for a single PM project.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

export function PMIssueList({ pmProjectId }: { pmProjectId: number }) {
  const { data, isLoading, error } =
    trpc.pmCentral.issues.listByProject.useQuery({ pmProjectId });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    );
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No issues.</p>;
  return (
    <ul className="divide-y rounded border">
      {data.map((i) => (
        <li key={i.id} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{i.title}</div>
            <p className="text-xs text-muted-foreground">
              {i.ownerUserId ? `owner #${i.ownerUserId}` : "unassigned"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{i.severity}</Badge>
            <Badge>{i.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
