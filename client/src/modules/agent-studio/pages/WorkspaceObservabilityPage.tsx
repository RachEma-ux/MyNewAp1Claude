/**
 * Workspace Observability admin page — no-deferral continuation-28 slice 117.
 *
 * Global Agent Studio page reachable at `/agent-studio/workspace-observability`.
 * Closes the partial-consumer gap on `workspaceObservability.*` — 18 unconsumed
 * endpoints across notifications / background jobs / error events.
 */

import { Activity } from "lucide-react";

import { PageHeader } from "../components/ui";
import { WorkspaceObservabilityPanel } from "../components/WorkspaceObservabilityPanel";

export default function WorkspaceObservabilityPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Workspace Observability"
        subtitle="Long-tail operator surface for cross-cutting observability primitives — notifications (list / lookup / mark-read / dismiss / broadcast), background jobs (list / lookup / cancel / retry, both single and bulk), and error events (list / lookup)."
        icon={<Activity className="h-5 w-5" />}
      />
      <WorkspaceObservabilityPanel />
    </div>
  );
}
