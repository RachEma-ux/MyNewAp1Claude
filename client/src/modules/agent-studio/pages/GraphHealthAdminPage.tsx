/**
 * Graph Health admin page — PR-V1-190 + no-deferral continuation-35
 * slice 138.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/graph-health-admin`. Mounts the GraphHealthAdminPanel
 * (alerts + drift + staleness cron) and the GraphProjectionDrainPanel
 * (drain cron status + run-drain-now).
 */

import { HeartPulse } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphHealthAdminPanel } from "../components/GraphHealthAdminPanel";
import { GraphProjectionDrainPanel } from "../components/GraphProjectionDrainPanel";

export default function GraphHealthAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph health admin"
        subtitle="Alert cron status + currently-open un-resolved health alerts. Read-only — alert resolution lives on the server-side helper."
        icon={<HeartPulse className="h-5 w-5" />}
      />
      <GraphHealthAdminPanel />
      <GraphProjectionDrainPanel />
    </div>
  );
}
