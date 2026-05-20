/**
 * Graph Workspace Admin page — no-deferral continuation-39 slice 150.
 *
 * Global Agent Studio page reachable at
 * `/agent-studio/graph-workspace-admin`. Closes the
 * partial-consumer gap on graphWorkspace.{backendHealth,
 * neighborhood, shortestPath} — the final 3 unconsumed endpoints
 * across the partial-consumer audit cycle.
 *
 * Final arc closure: after this lands, all 17 partial-consumer
 * routers are 100% UI-consumed.
 */

import { Telescope } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphWorkspaceUtilsPanel } from "../components/GraphWorkspaceUtilsPanel";

export default function GraphWorkspaceAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Workspace Utilities"
        subtitle="Operator probes against the graph backend: health check, neighborhood traversal, and shortest-path computation. Distinct from the editor-centric GraphWorkspacePage."
        icon={<Telescope className="h-5 w-5" />}
      />
      <GraphWorkspaceUtilsPanel />
    </div>
  );
}
