/**
 * Graph Agent Admin page — no-deferral continuation-31 slice 126.
 *
 * Global Agent Studio page reachable at `/agent-studio/graph-agent-admin`.
 * Closes the partial-consumer gap on graphAgent.{health, run,
 * exportTraceMarkdown, exportTraceToNote}.
 */

import { Brain } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphAgentAdminPanel } from "../components/GraphAgentAdminPanel";

export default function GraphAgentAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Agent Admin"
        subtitle="Operator surface for the Graph Agent Lite/Advanced runtime: health probe, agent-trigger run, and decision-trace markdown / vault-note export."
        icon={<Brain className="h-5 w-5" />}
      />
      <GraphAgentAdminPanel />
    </div>
  );
}
