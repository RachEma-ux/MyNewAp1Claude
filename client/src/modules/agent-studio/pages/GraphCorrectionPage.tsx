/**
 * Graph Correction admin page — no-deferral continuation-24 slice 105.
 *
 * Global Agent Studio page reachable at `/agent-studio/graph-correction`.
 * Closes the partial-consumer gap on `graphCorrection.{submit, list,
 * get, approve, reject, requestRevision, withdraw, bulkApprove,
 * bulkReject, listAudit}` — 10 lifecycle endpoints. First true
 * master-detail in the partial-consumer audit cycle.
 *
 * Distinct from `GraphCorrectionProposalsRetentionPanel` (retention).
 */

import { ShieldAlert } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphCorrectionPanel } from "../components/GraphCorrectionPanel";

export default function GraphCorrectionPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Correction"
        subtitle="Submit correction proposals + browse pending proposals with multi-select bulk approve/reject + per-proposal approve / reject / request revision / withdraw + audit-trail drill-in. Distinct from the retention pruning panel."
        icon={<ShieldAlert className="h-5 w-5" />}
      />
      <GraphCorrectionPanel />
    </div>
  );
}
