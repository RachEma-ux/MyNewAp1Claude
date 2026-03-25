/**
 * PS Top-Level Page — Standalone PS page accessible from the main hamburger menu
 *
 * Since PS is workspace-scoped, this page uses a default workspace or lets the
 * user pick one. It re-uses the workspace-scoped PS components.
 */
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { PSCatalogPage } from "./PSCatalogPage";
import { PSControlPanelPage } from "./PSControlPanelPage";
import { PSWizardPage } from "./PSWizardPage";
import { PSListPage } from "./PSListPage";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function useDefaultWorkspace() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  return workspaces?.[0]?.id ?? null;
}

export function PSTopLevelPage() {
  const { item } = useParams<{ item?: string }>();
  const workspaceId = useDefaultWorkspace();

  if (!workspaceId) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Projects System</h1>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">Create or select a workspace to access Projects System.</p>
          <Link href="/ws/list"><Button variant="outline" size="sm">Go to Workspaces</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  switch (item) {
    case "control-panel": return <PSControlPanelPage workspaceId={workspaceId} />;
    case "wizard": return <PSWizardPage workspaceId={workspaceId} />;
    case "list": return <PSListPage workspaceId={workspaceId} />;
    case "catalog":
    default: return <PSCatalogPage workspaceId={workspaceId} />;
  }
}

export default PSTopLevelPage;
