import { useRoute } from "wouter";
import DashboardPanel from "./pm-central/DashboardPanel";
import PMShellPanel from "./pm-central/PMShellPanel";
import PMShellPage from "./pm-central/PMShellPage";
import ProjectsPanel from "./pm-central/ProjectsPanel";
import MethodsPanel from "./pm-central/MethodsPanel";
import ParticipantsPanel from "./pm-central/ParticipantsPanel";
import ToolsPanel from "./pm-central/ToolsPanel";
import ResourcesPanel from "./pm-central/ResourcesPanel";
import GovernancePanel from "./pm-central/GovernancePanel";
import DocumentationPanel from "./pm-central/DocumentationPanel";
import TemplatesPanel from "./pm-central/TemplatesPanel";

export default function PMCentralPage() {
  const [, params] = useRoute("/pm-central/:item");
  const item = params?.item || "dashboard";

  switch (item) {
    case "dashboard":
      return <DashboardPanel />;
    case "shell":
      return <PMShellPanel />;
    case "pm-shell":
      return <PMShellPage />;
    case "projects":
      return <ProjectsPanel />;
    case "methods":
      return <MethodsPanel />;
    case "participants":
      return <ParticipantsPanel />;
    case "tools":
      return <ToolsPanel />;
    case "resources":
      return <ResourcesPanel />;
    case "governance":
      return <GovernancePanel />;
    case "documentation":
      return <DocumentationPanel />;
    case "templates":
      return <TemplatesPanel />;
    case "examples":
      return <TemplatesPanel defaultTab="examples" />;
    default:
      return <DashboardPanel />;
  }
}
