import { useRoute } from "wouter";
import OverviewPanel from "./hq/OverviewPanel";
import TeamPanel from "./hq/TeamPanel";
import ProjectsPanel from "./hq/ProjectsPanel";
import OperationsPanel from "./hq/OperationsPanel";
import IncidentsPanel from "./hq/IncidentsPanel";
import ChangesPanel from "./hq/ChangesPanel";
import MonitoringPanel from "./hq/MonitoringPanel";
import ActivityPanel from "./hq/ActivityPanel";

export default function DigitalHQPage() {
  const [, params] = useRoute("/digital-hq/:item");
  const item = params?.item || "overview";

  switch (item) {
    case "overview":
      return <OverviewPanel />;
    case "team":
      return <TeamPanel />;
    case "projects":
      return <ProjectsPanel />;
    case "operations":
      return <OperationsPanel />;
    case "incidents":
      return <IncidentsPanel />;
    case "changes":
      return <ChangesPanel />;
    case "monitoring":
      return <MonitoringPanel />;
    case "activity":
      return <ActivityPanel />;
    default:
      return <OverviewPanel />;
  }
}
