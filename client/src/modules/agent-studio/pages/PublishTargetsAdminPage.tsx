/**
 * Publish Targets admin page — PR-V1-186.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/publish-targets-admin`. Slim wrapper that mounts
 * the PublishTargetsAdminPanel.
 */

import { Send } from "lucide-react";

import { PageHeader } from "../components/ui";
import { PublishTargetsAdminPanel } from "../components/PublishTargetsAdminPanel";

export default function PublishTargetsAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Publish targets admin"
        subtitle="Sync/publish target registry (Phase 19) + recent execution history. Read-only — promotion mutations live elsewhere."
        icon={<Send className="h-5 w-5" />}
      />
      <PublishTargetsAdminPanel />
    </div>
  );
}
