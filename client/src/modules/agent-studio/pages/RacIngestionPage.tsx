/**
 * RAC Ingestion admin page — no-deferral continuation-20 slice 93.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/rac-ingestion`. Closes the UI-consumer gap for
 * the `racIngestion.*` tRPC surface (RAC Phase 3 — 3-endpoint
 * preview/register/validate workflow).
 */

import { Database } from "lucide-react";

import { PageHeader } from "../components/ui";
import { RacIngestionPanel } from "../components/RacIngestionPanel";

export default function RacIngestionPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="RAC Ingestion"
        subtitle="Preview a RAC source's first N chunks, register it (resolves embedding binding + pins model dim), then validate the resulting index — all sharing the same {workspaceId, sourceId} reference."
        icon={<Database className="h-5 w-5" />}
      />
      <RacIngestionPanel />
    </div>
  );
}
