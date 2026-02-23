import { useRoute } from "wouter";
import GovernanceOverviewPanel from "./governance/GovernanceOverviewPanel";
import ScorecardsExplorerPanel from "./governance/ScorecardsExplorerPanel";
import ControlsCatalogPanel from "./governance/ControlsCatalogPanel";
import PacksRunnersPanel from "./governance/PacksRunnersPanel";
import FreezesPanel from "./governance/FreezesPanel";
import DriftMonitoringPanel from "./governance/DriftMonitoringPanel";
import CoverageMapPanel from "./governance/CoverageMapPanel";

export default function GovernanceCenterPage() {
  const [, params] = useRoute("/governance/:item");
  const item = params?.item || "overview";

  switch (item) {
    case "overview": return <GovernanceOverviewPanel />;
    case "scorecards": return <ScorecardsExplorerPanel />;
    case "controls": return <ControlsCatalogPanel />;
    case "packs": return <PacksRunnersPanel />;
    case "freezes": return <FreezesPanel />;
    case "drift": return <DriftMonitoringPanel />;
    case "coverage": return <CoverageMapPanel />;
    default: return <GovernanceOverviewPanel />;
  }
}
