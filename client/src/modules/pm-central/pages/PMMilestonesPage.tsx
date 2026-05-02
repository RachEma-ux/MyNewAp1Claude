/**
 * /pm-central/rtlm/milestones — workspace-wide milestone view.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMMilestonesPage() {
  const workspaceId = useDefaultWorkspaceId();
  const projectsQuery = trpc.pmCentral.projects.list.useQuery(
    { workspaceId: workspaceId ?? 0, limit: 50 },
    { enabled: !!workspaceId },
  );
  const projectIds = useMemo(
    () => projectsQuery.data?.map((p) => p.id) ?? [],
    [projectsQuery.data],
  );
  const milestoneQueries = trpc.useQueries((t) =>
    projectIds.map((id) =>
      t.pmCentral.milestones.listByProject({ pmProjectId: id }),
    ),
  );

  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );
  const milestones = milestoneQueries.flatMap((q) => q.data ?? []);
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {milestones.map((m) => (
                <li
                  key={`${m.pmProjectId}-${m.id}`}
                  className="p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{m.title}</div>
                    <p className="text-xs text-muted-foreground">
                      project #{m.pmProjectId}
                      {m.dueDate
                        ? ` · due ${new Date(m.dueDate).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <Badge>{m.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
