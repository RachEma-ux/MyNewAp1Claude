/**
 * CV Top-Level Page — Standalone CV page accessible from the main hamburger menu
 *
 * Since CV is workspace-scoped, this page uses a default workspace or lets the
 * user pick one. It re-uses the workspace-scoped CV components.
 */
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { CVPortfolioPage } from "./CVPortfolioPage";
import { CVWizardPage } from "./CVWizardPage";
import { CVSettingsPage } from "./CVSettingsPage";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function useDefaultWorkspace() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  return workspaces?.[0]?.id ?? null;
}

export function CVTopLevelPage() {
  const { item } = useParams<{ item?: string }>();
  const workspaceId = useDefaultWorkspace();

  if (!workspaceId) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Culture Values</h1>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground mb-3">Create or select a workspace to access Culture Values.</p>
          <Link href="/ws/list"><Button variant="outline" size="sm">Go to Workspaces</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  switch (item) {
    case "wizard": return <CVWizardPage workspaceId={workspaceId} />;
    case "settings": return <CVSettingsPage workspaceId={workspaceId} />;
    case "portfolio":
    default: return <CVPortfolioPage workspaceId={workspaceId} />;
  }
}

export default CVTopLevelPage;
