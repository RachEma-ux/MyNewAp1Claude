/**
 * Semantic Enrichment admin page — no-deferral continuation-25 slice 108.
 *
 * Global Agent Studio page reachable at
 * `/agent-studio/semantic-enrichment`. Closes the partial-consumer gap
 * on `semanticEnrichment.{triggerRun, listRecentRuns, getRunStats,
 * listProposals, listKnownProposalKinds, listCandidatesByKind,
 * listRecentRejectionsByKind, promoteBulk}` — 8 endpoints across
 * trigger / run-monitoring / candidate-exploration / bulk-promotion.
 */

import { Sparkles } from "lucide-react";

import { PageHeader } from "../components/ui";
import { SemanticEnrichmentPanel } from "../components/SemanticEnrichmentPanel";

export default function SemanticEnrichmentPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Semantic Enrichment"
        subtitle="Trigger enrichment runs + browse recent runs and proposals + explore candidates / rejections by kind + bulk-promote pending proposals into the graph-correction surface."
        icon={<Sparkles className="h-5 w-5" />}
      />
      <SemanticEnrichmentPanel />
    </div>
  );
}
