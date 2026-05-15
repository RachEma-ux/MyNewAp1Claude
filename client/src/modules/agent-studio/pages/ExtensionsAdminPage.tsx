/**
 * Extensions Admin page — V1+ Phase 18 follow-up. PR-V1-163.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/extensions-admin`. Slim wrapper that mounts the
 * #918 ExtensionsAdminPanel for the default workspace (1).
 *
 * Cross-workspace browsing is deferred — see RetrofitPage for the
 * existing per-workspace surfaces (Ingestion / Knowledge Units /
 * Provenance) that follow the same `workspaceId=1` default.
 */

import { Plug } from "lucide-react";

import { PageHeader } from "../components/ui";
import { ExtensionsAdminPanel } from "../components/ExtensionsAdminPanel";

interface Props {
  readonly workspaceId?: number;
}

export default function ExtensionsAdminPage({ workspaceId = 1 }: Props) {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Extensions admin"
        subtitle="Operator browser for installed extensions — governance status, declared capability lanes, capability-pinned tool declarations. Read-only; install/approve workflows live in the tRPC router."
        icon={<Plug className="h-5 w-5" />}
      />
      <ExtensionsAdminPanel workspaceId={workspaceId} />
    </div>
  );
}
