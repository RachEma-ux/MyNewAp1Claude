/**
 * PMProjectList — list of PM Central projects.
 */

import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export function PMProjectList({ workspaceId }: { workspaceId: number }) {
  const { data, isLoading, error } = trpc.pmCentral.projects.list.useQuery({
    workspaceId,
    limit: 50,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    );
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">No projects yet.</p>;
  return (
    <ul className="divide-y rounded border">
      {data.map((p) => (
        <li key={p.id} className="p-3 flex items-center justify-between">
          <div>
            <Link
              to={`/pm-central/rtlm/projects/${p.id}`}
              className="font-medium hover:underline"
            >
              {p.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              {p.sourceModule
                ? `from ${p.sourceModule}#${p.sourceRefId ?? "?"}`
                : "internal"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{p.priority}</Badge>
            <Badge>{p.status}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
