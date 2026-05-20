/**
 * Code Graph admin page — no-deferral continuation-18 slice 87.
 *
 * Global Agent Studio page reachable at `/agent-studio/code-graph`.
 * Closes the UI-consumer gap for the entire `codeGraph.*` tRPC
 * surface (7 endpoints — listIngestions / getIngestionStats /
 * listIngestionNodes / listIngestionEdges / listRepositories /
 * listRecentParserErrors / listKnownTypes) shipped at T-G.2.α.
 *
 * Direct pattern replication of slice 84's SecurityGraphPage —
 * the routers are structurally near-identical (continuation-18
 * catalogue maps the field-rename substitutions).
 */

import { ScanSearch } from "lucide-react";

import { PageHeader } from "../components/ui";
import { CodeGraphPanel } from "../components/CodeGraphPanel";

export default function CodeGraphPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Code Graph"
        subtitle="Per-repository freshness + parser-error rollup + ingestion drill-in across the code-graph stack (tree-sitter parser feeding the symbol-graph projection)."
        icon={<ScanSearch className="h-5 w-5" />}
      />
      <CodeGraphPanel />
    </div>
  );
}
