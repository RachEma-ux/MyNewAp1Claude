/**
 * /pm-central/rtlm/issues — workspace-wide issues view.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMIssuesPage() {
  const workspaceId = useDefaultWorkspaceId();
  const projectsQuery = trpc.pmCentral.projects.list.useQuery(
    { workspaceId: workspaceId ?? 0, limit: 50 },
    { enabled: !!workspaceId },
  );
  const projectIds = useMemo(
    () => projectsQuery.data?.map((p) => p.id) ?? [],
    [projectsQuery.data],
  );
  const issueQueries = trpc.useQueries((t) =>
    projectIds.map((id) =>
      t.pmCentral.issues.listByProject({ pmProjectId: id }),
    ),
  );
  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );
  const issues = issueQueries.flatMap((q) => q.data ?? []);
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Issues</CardTitle>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {issues.map((i) => (
                <li
                  key={`${i.pmProjectId}-${i.id}`}
                  className="p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{i.title}</div>
                    <p className="text-xs text-muted-foreground">
                      project #{i.pmProjectId}
                      {i.ownerUserId ? ` · owner #${i.ownerUserId}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{i.severity}</Badge>
                    <Badge>{i.status}</Badge>
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
