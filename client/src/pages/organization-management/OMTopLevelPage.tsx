/**
 * OM Top-Level Page — Standalone OM page accessible from the main hamburger menu
 *
 * Auto-provisions a default workspace if none exists so that OM is never gated.
 */
import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { OMPortfolioPage } from "./OMPortfolioPage";
import { OMControlPanelPage } from "./OMControlPanelPage";
import { OMWizardPage } from "./OMWizardPage";
import { OMListPage } from "./OMListPage";
import { OMSettingsPage } from "./OMSettingsPage";
import { OMTemplatesPage } from "./OMTemplatesPage";
import { Loader2 } from "lucide-react";

function useAutoProvisionedWorkspace() {
  const utils = trpc.useUtils();
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();
  const createWs = trpc.workspaces.create.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  });
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoading && workspaces && workspaces.length === 0 && !attempted.current && !createWs.isPending) {
      attempted.current = true;
      createWs.mutate({ name: "Default", description: "Auto-created for Organization Management" });
    }
  }, [isLoading, workspaces, createWs]);

  return { workspaceId: workspaces?.[0]?.id ?? null, isLoading: isLoading || createWs.isPending };
}

export function OMTopLevelPage() {
  const { item } = useParams<{ item?: string }>();
  const { workspaceId, isLoading } = useAutoProvisionedWorkspace();

  if (isLoading || !workspaceId) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading Organization Management...
      </div>
    );
  }

  switch (item) {
    case "control-panel": return <OMControlPanelPage workspaceId={workspaceId} />;
    case "wizard": return <OMWizardPage workspaceId={workspaceId} />;
    case "list": return <OMListPage workspaceId={workspaceId} />;
    case "settings": return <OMSettingsPage workspaceId={workspaceId} />;
    case "templates": return <OMTemplatesPage workspaceId={workspaceId} />;
    case "portfolio":
    default: return <OMPortfolioPage workspaceId={workspaceId} />;
  }
}

export default OMTopLevelPage;
