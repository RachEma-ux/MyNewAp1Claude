/**
 * Approval Bus Admin page — PR-V1-184.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/approval-bus-admin`. Slim wrapper that mounts the
 * ApprovalBusAdminPanel.
 */

import { Webhook } from "lucide-react";

import { PageHeader } from "../components/ui";
import { ApprovalBusAdminPanel } from "../components/ApprovalBusAdminPanel";

export default function ApprovalBusAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Approval bus admin"
        subtitle="Cross-process approval-decided pubsub (D-RESUME-5). Confirms LISTEN is up and events are flowing across processes; force-reconnect when the backoff is stuck."
        icon={<Webhook className="h-5 w-5" />}
      />
      <ApprovalBusAdminPanel />
    </div>
  );
}
