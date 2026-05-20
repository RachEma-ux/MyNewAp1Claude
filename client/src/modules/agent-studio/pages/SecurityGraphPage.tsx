/**
 * Security Graph admin page — no-deferral continuation-17 slice 84.
 *
 * Global Agent Studio page reachable at `/agent-studio/security-
 * graph`. Closes the UI-consumer gap for the entire
 * `securityGraph.*` tRPC surface (7 endpoints — listIngestions /
 * getIngestionStats / listIngestionNodes / listIngestionEdges /
 * listSources / listRecentRejectionsByReason / listKnownTypes)
 * shipped at T-G.3.α.
 */

import { ShieldAlert } from "lucide-react";

import { PageHeader } from "../components/ui";
import { SecurityGraphPanel } from "../components/SecurityGraphPanel";

export default function SecurityGraphPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Security Graph"
        subtitle="Per-source freshness rollup + rejection rollup + ingestion drill-in across the security-graph stack (NVD CVE feed + scanner findings)."
        icon={<ShieldAlert className="h-5 w-5" />}
      />
      <SecurityGraphPanel />
    </div>
  );
}
