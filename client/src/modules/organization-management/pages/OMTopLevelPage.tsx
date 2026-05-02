/**
 * OM Top-Level Page — Standalone OM page accessible from the main hamburger menu
 *
 * OM is independent of workspaces. Uses a fixed internal scope ID for backend calls.
 */
import { useParams } from "wouter";
import { OMPortfolioPage } from "./OMPortfolioPage";
import { OMControlPanelPage } from "./OMControlPanelPage";
import { OMWizardPage } from "./OMWizardPage";
import { OMListPage } from "./OMListPage";
import { OMSettingsPage } from "./OMSettingsPage";
import { OMTemplatesPage } from "./OMTemplatesPage";

/** Fixed scope ID — OM data is global, not workspace-scoped */
const OM_SCOPE_ID = 0;

export function OMTopLevelPage() {
  const { item } = useParams<{ item?: string }>();

  switch (item) {
    case "control-panel": return <OMControlPanelPage workspaceId={OM_SCOPE_ID} />;
    case "wizard": return <OMWizardPage workspaceId={OM_SCOPE_ID} />;
    case "list": return <OMListPage workspaceId={OM_SCOPE_ID} />;
    case "settings": return <OMSettingsPage workspaceId={OM_SCOPE_ID} />;
    case "templates": return <OMTemplatesPage workspaceId={OM_SCOPE_ID} />;
    case "portfolio":
    default: return <OMPortfolioPage workspaceId={OM_SCOPE_ID} />;
  }
}

export default OMTopLevelPage;
