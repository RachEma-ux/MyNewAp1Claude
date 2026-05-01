import { useRoute } from "wouter";
import OrgAuthorityPanel from "./hq/OrgAuthorityPanel";
import RolesMembershipPanel from "./hq/RolesMembershipPanel";
import WorkspaceDirectoryPanel from "./hq/WorkspaceDirectoryPanel";
import AgentOrchestrationPanel from "./hq/AgentOrchestrationPanel";
import DiscoverabilityPanel from "./hq/DiscoverabilityPanel";
import NotificationsPanel from "./hq/NotificationsPanel";
import RiskBaselinesPanel from "./hq/RiskBaselinesPanel";
import CollaborationIntelPanel from "./hq/CollaborationIntelPanel";
import ApplicationWiringInventoryPanel from "./hq/ApplicationWiringInventoryPanel";

export default function DigitalHQPage() {
  const [, params] = useRoute("/hq/:item");
  const item = params?.item || "org-authority";

  switch (item) {
    case "org-authority":
      return <OrgAuthorityPanel />;
    case "roles":
      return <RolesMembershipPanel />;
    case "workspaces":
      return <WorkspaceDirectoryPanel />;
    case "agents":
      return <AgentOrchestrationPanel />;
    case "discover":
      return <DiscoverabilityPanel />;
    case "notifications":
      return <NotificationsPanel />;
    case "risk-baselines":
      return <RiskBaselinesPanel />;
    case "collaboration":
      return <CollaborationIntelPanel />;
    case "application-wiring":
      return <ApplicationWiringInventoryPanel />;
    default:
      return <OrgAuthorityPanel />;
  }
}
