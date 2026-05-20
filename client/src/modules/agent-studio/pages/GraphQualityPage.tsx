/**
 * Graph Quality admin page — no-deferral continuation-26 slice 111.
 *
 * Global Agent Studio page reachable at `/agent-studio/graph-quality`.
 * Closes the partial-consumer gap on graphQuality.* — 12 unconsumed
 * endpoints across scan / agent / proposal / dashboard groups.
 *
 * Distinct from the existing GraphQualityFindingsPage which surfaces
 * the findings list with dismiss + convert-to-proposal — this page
 * surfaces the rest of the lifecycle (dashboard, scans, agent runs,
 * apply mutations, finding/applied lookups).
 */

import { Award } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphQualityPanel } from "../components/GraphQualityPanel";

export default function GraphQualityPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph Quality"
        subtitle="Operator dashboard + scan triggers + agent runs + finding lookup + proposal apply/approve/verify chain. Coexists with the existing GraphQualityFindingsPage (findings table)."
        icon={<Award className="h-5 w-5" />}
      />
      <GraphQualityPanel />
    </div>
  );
}
