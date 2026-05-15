/**
 * Region Admin page — V2 Phase MR-1 Phase-2 ninth slice. PR-V1-157.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/region-admin`. Slim wrapper that mounts the
 * #913 RegionAdminPanel.
 */

import { Globe } from "lucide-react";

import { PageHeader } from "../components/ui";
import { RegionAdminPanel } from "../components/RegionAdminPanel";

export default function RegionAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Region admin"
        subtitle="Multi-region routing topology — active region registry, workspace pins, in-process cache state, and re-warm cron health. Single-region operators see no pins and a primary-only region row."
        icon={<Globe className="h-5 w-5" />}
      />
      <RegionAdminPanel />
    </div>
  );
}
