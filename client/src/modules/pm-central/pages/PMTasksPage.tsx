/**
 * /pm-central/rtlm/tasks — global task board across projects.
 *
 * Aggregates tasks via per-project listings (fan-out queries). For
 * large workspaces this can be replaced with a dedicated
 * cross-project list endpoint later.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMTasksPage() {
  const workspaceId = useDefaultWorkspaceId();
  const projectsQuery = trpc.pmCentral.projects.list.useQuery(
    { workspaceId: workspaceId ?? 0, limit: 50 },
    { enabled: !!workspaceId },
  );
  const projectIds = useMemo(
    () => projectsQuery.data?.map((p) => p.id) ?? [],
    [projectsQuery.data],
  );
  const taskQueries = trpc.useQueries((t) =>
    projectIds.map((id) => t.pmCentral.tasks.listByProject({ pmProjectId: id })),
  );

  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );
  if (projectsQuery.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const allTasks = taskQueries.flatMap((q) => q.data ?? []);
  return (
    <div className="p-6 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tasks across all projects</CardTitle>
        </CardHeader>
        <CardContent>
          {allTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {allTasks.map((t) => (
                <li
                  key={`${t.pmProjectId}-${t.id}`}
                  className="p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <p className="text-xs text-muted-foreground">
                      project #{t.pmProjectId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t.priority}</Badge>
                    <Badge>{t.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
