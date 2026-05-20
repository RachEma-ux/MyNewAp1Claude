/**
 * Golden Questions admin page — no-deferral continuation-12 slice 69.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/golden-questions`. Closes the UI-consumer gap
 * for slice 44's `goldenQuestions.triggerLiveEvaluation` mutation
 * + provides the operator entry point for the broader
 * `goldenQuestions.*` tRPC surface (6 read endpoints +
 * 1 mutation shipped server-side at slices 44 / T-D.5.α-δ).
 *
 * MVP scope (slice 69): wraps `GoldenQuestionsTriggerPanel`. The
 * recent-runs list + per-run drill-in (`listRecentRuns` +
 * `getRunStats` + `listRunResults`) are continuation-13+ scope.
 */

import { ShieldCheck } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GoldenQuestionsTriggerPanel } from "../components/GoldenQuestionsTriggerPanel";

export default function GoldenQuestionsPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Golden Questions"
        subtitle="Trigger live evaluation runs against seeded suites. Results persist into ags_golden_question_runs + ags_golden_question_results."
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <GoldenQuestionsTriggerPanel />
    </div>
  );
}
