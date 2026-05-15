/**
 * Graph Health admin page — PR-V1-190.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/graph-health-admin`. Slim wrapper that mounts
 * the GraphHealthAdminPanel.
 */

import { HeartPulse } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphHealthAdminPanel } from "../components/GraphHealthAdminPanel";

export default function GraphHealthAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph health admin"
        subtitle="Alert cron status + currently-open un-resolved health alerts. Read-only — alert resolution lives on the server-side helper."
        icon={<HeartPulse className="h-5 w-5" />}
      />
      <GraphHealthAdminPanel />
    </div>
  );
}
