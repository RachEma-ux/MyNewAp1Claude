/**
 * Graph Change Proposals admin page — no-deferral continuation-19 slice 90.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/graph-change-proposals`. Closes the UI-consumer
 * gap for the `graphChangeProposals.*` tRPC surface (Phase 11.5 —
 * 4-mutation approval workflow: submit / approve / reject /
 * withdraw). Mutation-only constraint: no `listProposals` query
 * exists, so approve / reject / withdraw require operator-supplied
 * proposalId values.
 *
 * Distinct from the existing `GraphChangeProposalsRetentionPanel`
 * (mounted inside RetrofitPage) which handles the pruning cron.
 * This page surfaces the lifecycle itself; retention is the
 * cleanup follow-up. Both panels read/write the same underlying
 * `ags_graph_change_proposals` table.
 */

import { Gavel } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphChangeProposalsLifecyclePanel } from "../components/GraphChangeProposalsLifecyclePanel";

export default function GraphChangeProposalsPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Change Proposals"
        subtitle="Phase 11.5 mutation approval workflow — submit a new proposal (node/edge create/update/deprecate/remove, entity merge/split, observation/provenance/projection correction) and run the approve / reject / withdraw lifecycle by proposal id."
        icon={<Gavel className="h-5 w-5" />}
      />
      <GraphChangeProposalsLifecyclePanel />
    </div>
  );
}
