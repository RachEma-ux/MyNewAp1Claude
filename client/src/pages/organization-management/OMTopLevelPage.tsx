/**
 * OM Top-Level Page — Standalone OM page accessible from the main hamburger menu
 *
 * Since OM is workspace-scoped, this page uses a default workspace or lets the
 * user pick one. It re-uses the workspace-scoped OM components.
 */
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { OMPortfolioPage } from "./OMPortfolioPage";
import { OMControlPanelPage } from "./OMControlPanelPage";
import { OMWizardPage } from "./OMWizardPage";
import { OMListPage } from "./OMListPage";
import { OMSettingsPage } from "./OMSettingsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function useDefaultWorkspace() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  return workspaces?.[0]?.id ?? null;
}

export function OMTopLevelPage() {
  const { item } = useParams<{ item?: string }>();
  const workspaceId = useDefaultWorkspace();

  if (!workspaceId) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Organization Management</h1>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">Create or select a workspace to access Organization Management.</p>
          <Link href="/ws/list"><Button variant="outline" size="sm">Go to Workspaces</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  switch (item) {
    case "control-panel": return <OMControlPanelPage workspaceId={workspaceId} />;
    case "wizard": return <OMWizardPage workspaceId={workspaceId} />;
    case "list": return <OMListPage workspaceId={workspaceId} />;
    case "settings": return <OMSettingsPage workspaceId={workspaceId} />;
    case "portfolio":
    default: return <OMPortfolioPage workspaceId={workspaceId} />;
  }
}

export default OMTopLevelPage;
