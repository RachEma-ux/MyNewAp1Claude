/**
 * Canvas operator page — V1+ Phase 17 closure. PR-V1-171.
 *
 * Global Agent Studio page reachable at
 * `/agent-studio/canvas-operator`. Slim wrapper mounting the
 * CanvasOperatorPanel for the default vault (1, matching the
 * RetrofitPage default).
 *
 * Pattern mirrors #908 RegionAdminPage + #914 ExtensionsAdminPage.
 */

import { LayoutGrid } from "lucide-react";

import { PageHeader } from "../components/ui";
import { CanvasOperatorPanel } from "../components/CanvasOperatorPanel";

interface Props {
  readonly initialVaultId?: number;
}

export default function CanvasOperatorPage({ initialVaultId = 1 }: Props) {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Canvas operator browser"
        subtitle="Read-only operator surface for Phase 17 canvases — browse canvases in a vault, inspect node + edge counts, see note references. An interactive editor lands in a separate slice."
        icon={<LayoutGrid className="h-5 w-5" />}
      />
      <CanvasOperatorPanel initialVaultId={initialVaultId} />
    </div>
  );
}
