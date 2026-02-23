import { useRoute } from "wouter";
import GovernanceDashboardPanel from "./governance/GovernanceDashboardPanel";
import GateCoveragePanel from "./governance/GateCoveragePanel";
import RiskMatrixPanel from "./governance/RiskMatrixPanel";
import AuditTrailPanel from "./governance/AuditTrailPanel";
import AccessControlPanel from "./governance/AccessControlPanel";
import PolicyEnginePanel from "./governance/PolicyEnginePanel";
import EvidenceVaultPanel from "./governance/EvidenceVaultPanel";
import HardeningPanel from "./governance/HardeningPanel";

export default function GovernanceCenterPage() {
  const [, params] = useRoute("/governance-center/:item");
  const item = params?.item || "dashboard";

  switch (item) {
    case "dashboard": return <GovernanceDashboardPanel />;
    case "gate-coverage": return <GateCoveragePanel />;
    case "risk-matrix": return <RiskMatrixPanel />;
    case "audit-trail": return <AuditTrailPanel />;
    case "rbac": return <AccessControlPanel />;
    case "policy-engine": return <PolicyEnginePanel />;
    case "evidence-vault": return <EvidenceVaultPanel />;
    case "hardening": return <HardeningPanel />;
    default: return <GovernanceDashboardPanel />;
  }
}
