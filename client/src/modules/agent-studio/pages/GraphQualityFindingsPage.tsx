/**
 * Graph Quality findings page — T-F.82 (T-F.4-α).
 *
 * Slim wrapper. The page reaches `/agent-studio/graph-quality-findings`
 * via the canonical 4-site shell wiring (lazy import in
 * `AgentStudioShell.tsx`, path parser in the same file, sidebar entry
 * in `AgentStudioSidebar.tsx`, route case in `routes.tsx`). The real
 * content lives in `GraphQualityFindingsPanel`.
 */

import { GraphQualityFindingsPanel } from "../components/GraphQualityFindingsPanel";

export default function GraphQualityFindingsPage() {
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">Graph Quality — Findings</h2>
      <GraphQualityFindingsPanel />
    </div>
  );
}
