/**
 * /pm-central/rtlm/decisions — workspace-wide decisions view.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMDecisionsPage() {
  const workspaceId = useDefaultWorkspaceId();
  const projectsQuery = trpc.pmCentral.projects.list.useQuery(
    { workspaceId: workspaceId ?? 0, limit: 50 },
    { enabled: !!workspaceId },
  );
  const projectIds = useMemo(
    () => projectsQuery.data?.map((p) => p.id) ?? [],
    [projectsQuery.data],
  );
  const decisionQueries = trpc.useQueries((t) =>
    projectIds.map((id) =>
      t.pmCentral.decisions.listByProject({ pmProjectId: id }),
    ),
  );
  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );
  const decisions = decisionQueries.flatMap((q) => q.data ?? []);
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions recorded.</p>
          ) : (
            <ul className="divide-y rounded border">
              {decisions.map((d) => (
                <li key={`${d.pmProjectId}-${d.id}`} className="p-3">
                  <div className="font-medium">{d.title}</div>
                  <p className="text-sm">{d.decision}</p>
                  {d.rationale && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Rationale: {d.rationale}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    project #{d.pmProjectId} · decided{" "}
                    {new Date(d.decidedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
