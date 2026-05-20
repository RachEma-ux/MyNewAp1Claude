/**
 * Recommendation admin page — no-deferral continuation-15 slice 78.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/recommendation`. Closes the UI-consumer gap for
 * the `recommendation.*` tRPC surface (3 endpoints — listKnownKinds /
 * recommend / recommendBatch) shipped at T-G.4.
 *
 * MVP scope (slice 78): single-kind recommend via
 * `RecommendationRunnerPanel`. The multi-kind `recommendBatch`
 * endpoint stays unconsumed and is the explicit continuation-16
 * candidate.
 */

import { Sparkles } from "lucide-react";

import { PageHeader } from "../components/ui";
import { RecommendationRunnerPanel } from "../components/RecommendationRunnerPanel";

export default function RecommendationPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Recommendation"
        subtitle="Closed-taxonomy recommendation runner — pick a kind, anchor (typeKey + id), and workspace, then see what GraphRAG recommends with confidence + reasoning + provenance."
        icon={<Sparkles className="h-5 w-5" />}
      />
      <RecommendationRunnerPanel />
    </div>
  );
}
