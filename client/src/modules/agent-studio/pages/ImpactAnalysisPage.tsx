/**
 * Impact Analysis admin page — no-deferral continuation-14 slice 75.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/impact-analysis`. Closes the UI-consumer gap for
 * the `impactAnalysis.*` tRPC surface (3 endpoints — listKnownKinds
 * / summarizeResult / runImpactAnalysis) shipped at T-G.5.α + the
 * no-deferral slice 29 template registry.
 */

import { Network } from "lucide-react";

import { PageHeader } from "../components/ui";
import { ImpactAnalysisRunnerPanel } from "../components/ImpactAnalysisRunnerPanel";

export default function ImpactAnalysisPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Impact Analysis"
        subtitle="Closed-taxonomy traversal — pick a kind + a starting node and see what depends on it. Stub kinds return anchor-only; template-backed kinds traverse the graph."
        icon={<Network className="h-5 w-5" />}
      />
      <ImpactAnalysisRunnerPanel />
    </div>
  );
}
