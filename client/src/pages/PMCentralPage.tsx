import { useRoute } from "wouter";
import DashboardPanel from "./pm-central/DashboardPanel";
import PMShellPanel from "./pm-central/PMShellPanel";
import PMShellPage from "./pm-central/PMShellPage";
import ProjectsPanel from "./pm-central/ProjectsPanel";
import PlansPanel from "./pm-central/PlansPanel";
import ExecutionPanel from "./pm-central/ExecutionPanel";
import ChangesPanel from "./pm-central/ChangesPanel";
import RisksPanel from "./pm-central/RisksPanel";
import ReportsPanel from "./pm-central/ReportsPanel";
import ParticipantsPanel from "./pm-central/ParticipantsPanel";
import TemplatesPanel from "./pm-central/TemplatesPanel";
import MethodesPage from "./pm-central/MethodesPage";
import AgentEnginePanel from "./pm-central/AgentEnginePanel";
import AgentRunDetailPanel from "./pm-central/AgentRunDetailPanel";

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
    case "plans":
      return <PlansPanel />;
    case "execution":
      return <ExecutionPanel />;
    case "changes":
      return <ChangesPanel />;
    case "risks":
      return <RisksPanel />;
    case "collaboration":
      return <ParticipantsPanel />;
    case "reports":
      return <ReportsPanel />;
    case "methodes":
      return <MethodesPage />;
    case "templates":
      return <TemplatesPanel />;
    case "examples":
      return <TemplatesPanel defaultTab="examples" />;
    case "agent-engine":
      return <AgentEnginePanel />;
    case "projects":
      return <DashboardPanel />;
    default:
      return <DashboardPanel />;
  }
}
