/**
 * /pm-central/rtlm/risks — workspace-wide risks view.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMRisksPage() {
  const workspaceId = useDefaultWorkspaceId();
  const projectsQuery = trpc.pmCentral.projects.list.useQuery(
    { workspaceId: workspaceId ?? 0, limit: 50 },
    { enabled: !!workspaceId },
  );
  const projectIds = useMemo(
    () => projectsQuery.data?.map((p) => p.id) ?? [],
    [projectsQuery.data],
  );
  const riskQueries = trpc.useQueries((t) =>
    projectIds.map((id) => t.pmCentral.risks.listByProject({ pmProjectId: id })),
  );

  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );
  const risks = riskQueries.flatMap((q) => q.data ?? []);
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Risks</CardTitle>
        </CardHeader>
        <CardContent>
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risks yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {risks.map((r) => (
                <li
                  key={`${r.pmProjectId}-${r.id}`}
                  className="p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <p className="text-xs text-muted-foreground">
                      project #{r.pmProjectId} · prob {r.probability}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.severity}</Badge>
                    <Badge>{r.status}</Badge>
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
