/**
 * VaultRuntimeTracesPage — child of the Vault Explorer group.
 *
 * Runtime + decision trace timelines for any `agsRuntimeRuns` row,
 * projected into Neo4j CE as graph paths. Reuses the self-contained
 * `RuntimeAndDecisionTraceView` component the legacy
 * `GraphWorkspacePage` composes. Backed by the Native Graph
 * Workspace runtime — `agentStudio.graphWorkspace.runImpactTemplate`
 * with `runtime_trace_path` / `decision_trace_path` template keys.
 */

import { Activity } from "lucide-react";
import { RuntimeAndDecisionTraceView } from "../components/graph-workspace";
import { PageHeader } from "../components/ui";

export default function VaultRuntimeTracesPage() {
  return (
    <div className="p-4 space-y-4" data-testid="vault-traces-page">
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Runtime Traces"
        subtitle="Runtime + decision trace timelines for any agsRuntimeRuns row, projected as graph paths."
      />
      <RuntimeAndDecisionTraceView />
    </div>
  );
}
