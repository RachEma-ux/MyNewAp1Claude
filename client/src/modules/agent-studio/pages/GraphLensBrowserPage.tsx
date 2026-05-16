/**
 * Graph Lens browser page — T-F.62.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/graph-lens-browser`. Slim wrapper that mounts the
 * GraphLensBrowserPanel — the first operator surface over the lens
 * registry / runner registry (#992 / #998 / #1253 / #1254 / #1255).
 */

import { Telescope } from "lucide-react";

import { PageHeader } from "../components/ui";
import { GraphLensBrowserPanel } from "../components/GraphLensBrowserPanel";

export default function GraphLensBrowserPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Graph lens browser"
        subtitle="Renders any registered lens via agentStudio.graphLens.render. Placeholder badges flag kinds without a runner installed."
        icon={<Telescope className="h-5 w-5" />}
      />
      <GraphLensBrowserPanel />
    </div>
  );
}
