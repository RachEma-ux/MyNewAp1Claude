/**
 * /pm-central/rtlm — PM Central RTLM module dashboard.
 *
 * Distinct from the legacy PMCentralShellPage (still mounted at the
 * non-/rtlm paths). This dashboard is the canonical view for the
 * registered PM Central module.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PMStatusCards } from "../components/PMStatusCards";
import { PMHandoffQueue } from "../components/PMHandoffQueue";
import { PMProjectList } from "../components/PMProjectList";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMCentralDashboardPage() {
  const workspaceId = useDefaultWorkspaceId();
  const summaryQuery = trpc.pmCentral.dashboard.summary.useQuery(
    { workspaceId: workspaceId ?? 0 },
    { enabled: !!workspaceId },
  );

  if (!workspaceId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Resolving workspace…
      </div>
    );
  }

  const summary = summaryQuery.data;

  return (
    <div className="p-6 flex flex-col gap-4">
      <PMStatusCards
        totalProjects={summary?.totalProjects ?? 0}
        activeProjects={summary?.activeProjects ?? 0}
        blockedProjects={summary?.blockedProjects ?? 0}
        overdueMilestones={summary?.overdueMilestones ?? 0}
        openRisks={summary?.openRisks ?? 0}
        openIssues={summary?.openIssues ?? 0}
        pendingHandoffs={summary?.pendingHandoffs ?? 0}
        dbConnected={summary?.dbConnected ?? false}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent projects</CardTitle>
            </CardHeader>
            <CardContent>
              <PMProjectList workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </div>
        <div>
          <PMHandoffQueue workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
