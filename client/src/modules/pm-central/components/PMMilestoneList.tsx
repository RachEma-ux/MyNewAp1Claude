/**
 * PMMilestoneList — milestones for a single PM project.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

export function PMMilestoneList({ pmProjectId }: { pmProjectId: number }) {
  const { data, isLoading, error } =
    trpc.pmCentral.milestones.listByProject.useQuery({ pmProjectId });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    );
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No milestones.</p>;
  return (
    <ul className="divide-y rounded border">
      {data.map((m) => (
        <li key={m.id} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{m.title}</div>
            <p className="text-xs text-muted-foreground">
              {m.dueDate
                ? `due ${new Date(m.dueDate).toLocaleDateString()}`
                : "no due date"}
            </p>
          </div>
          <Badge>{m.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
