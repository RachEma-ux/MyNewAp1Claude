/**
 * Canvas Projection Events Drain admin page — V1+ 17-γ slice
 * (PR-V1-86).
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/canvas-projection-events-drain`. Mounts the
 * #814 CanvasProjectionEventsDrainStatusPanel as the primary
 * surface — single panel, no picker (the drain is process-local
 * + cross-workspace).
 */

import { Activity } from "lucide-react";

import { PageHeader } from "../components/ui";
import { CanvasProjectionEventsDrainStatusPanel } from "../components/CanvasProjectionEventsDrainStatusPanel";

export default function CanvasProjectionEventsDrainPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Canvas Projection Events Drain"
        subtitle="Operator observability for the 17-γ canvas projection events drain scheduler. Confirms ticks are firing, the cursor map is advancing, and the operator-supplied forwarder has been wired."
        icon={<Activity className="h-5 w-5" />}
      />
      <CanvasProjectionEventsDrainStatusPanel />
    </div>
  );
}
