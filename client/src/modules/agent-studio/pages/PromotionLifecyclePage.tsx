/**
 * Promotion Lifecycle admin page — no-deferral continuation-23 slice 102.
 *
 * Global Agent Studio page reachable at `/agent-studio/promotion-lifecycle`.
 * Closes the partial-consumer gap on the `promotion.{submit, approve,
 * reject, rollback}` 4-mutation lifecycle (retention endpoints already
 * had a consumer via NotePromotionsRetentionPanel).
 */

import { GitBranch } from "lucide-react";

import { PageHeader } from "../components/ui";
import { PromotionLifecyclePanel } from "../components/PromotionLifecyclePanel";

export default function PromotionLifecyclePage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Promotion Lifecycle"
        subtitle="Submit / approve / reject / rollback note promotions across 10 promotion kinds (knowledge_unit, cag_block, graph_skill_pack, tool_knowledge, workflow, policy, evaluation_case, runtime_investigation, graph_entity, temporal_observation). Distinct from the retention panel."
        icon={<GitBranch className="h-5 w-5" />}
      />
      <PromotionLifecyclePanel />
    </div>
  );
}
