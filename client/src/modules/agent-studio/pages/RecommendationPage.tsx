/**
 * Recommendation admin page — no-deferral continuation-15 slice 78
 * + continuation-16 slice 81.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/recommendation`. Closes the UI-consumer gap for
 * the `recommendation.*` tRPC surface (3 endpoints — listKnownKinds /
 * recommend / recommendBatch) shipped at T-G.4.
 *
 *   - Slice 78 (continuation-15): `RecommendationRunnerPanel`
 *     surfaces single-kind `recommend` + `listKnownKinds`.
 *   - Slice 81 (continuation-16): `RecommendationBatchRunnerPanel`
 *     surfaces multi-kind `recommendBatch` mounted below the
 *     single-kind panel.
 */

import { Sparkles } from "lucide-react";

import { PageHeader } from "../components/ui";
import { RecommendationRunnerPanel } from "../components/RecommendationRunnerPanel";
import { RecommendationBatchRunnerPanel } from "../components/RecommendationBatchRunnerPanel";

export default function RecommendationPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Recommendation"
        subtitle="Closed-taxonomy recommendation runner — pick a kind, anchor (typeKey + id), and workspace, then see what GraphRAG recommends with confidence + reasoning + provenance."
        icon={<Sparkles className="h-5 w-5" />}
      />
      <RecommendationRunnerPanel />
      <RecommendationBatchRunnerPanel />
    </div>
  );
}
