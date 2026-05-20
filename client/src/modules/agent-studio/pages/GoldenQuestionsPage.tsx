/**
 * Golden Questions admin page — no-deferral continuation-12 slice 69
 * + continuation-13 slice 72 + continuation-34 slice 135.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/golden-questions`. Closes the UI-consumer gap
 * for the entire `goldenQuestions.*` tRPC surface (7 endpoints,
 * 7/7 consumed after slice 135).
 *
 *   - Slice 69 (continuation-12): `GoldenQuestionsTriggerPanel`
 *     surfaces `triggerLiveEvaluation` + `listSuites`.
 *   - Slice 72 (continuation-13): `GoldenQuestionsRecentRunsPanel`
 *     surfaces `listRecentRuns` + `getRunStats` + `listRunResults`
 *     + `getQuestionDetail` in a master-detail layout below the
 *     trigger panel.
 *   - Slice 135 (continuation-34): `GoldenQuestionsSuiteBrowserPanel`
 *     surfaces `listQuestionsInSuite` — operator browse of the
 *     questions inside a suite without firing a live run.
 */

import { ShieldCheck } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GoldenQuestionsTriggerPanel } from "../components/GoldenQuestionsTriggerPanel";
import { GoldenQuestionsRecentRunsPanel } from "../components/GoldenQuestionsRecentRunsPanel";
import { GoldenQuestionsSuiteBrowserPanel } from "../components/GoldenQuestionsSuiteBrowserPanel";

export default function GoldenQuestionsPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Golden Questions"
        subtitle="Trigger live evaluation runs against seeded suites. Results persist into ags_golden_question_runs + ags_golden_question_results."
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <GoldenQuestionsTriggerPanel />
      <GoldenQuestionsSuiteBrowserPanel />
      <GoldenQuestionsRecentRunsPanel />
    </div>
  );
}
