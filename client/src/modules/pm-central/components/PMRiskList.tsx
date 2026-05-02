/**
 * PMRiskList — risks for a single PM project.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

export function PMRiskList({ pmProjectId }: { pmProjectId: number }) {
  const { data, isLoading, error } =
    trpc.pmCentral.risks.listByProject.useQuery({ pmProjectId });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    );
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No risks.</p>;
  return (
    <ul className="divide-y rounded border">
      {data.map((r) => (
        <li key={r.id} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{r.title}</div>
            <p className="text-xs text-muted-foreground">
              prob: {r.probability}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{r.severity}</Badge>
            <Badge>{r.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
