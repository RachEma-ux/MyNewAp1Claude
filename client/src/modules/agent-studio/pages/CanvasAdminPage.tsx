/**
 * Canvas Admin page — no-deferral continuation-30 slice 123.
 *
 * Global Agent Studio page reachable at `/agent-studio/canvas-admin`.
 * Closes the partial-consumer gap on `canvas.{get, create, createNode,
 * updateNode, deleteNode, createEdge}` — 6 unconsumed endpoints.
 *
 * Coexists with the existing CanvasOperatorPage (browser) — this page
 * surfaces the create/update/delete write-side.
 */

import { LayoutGrid } from "lucide-react";

import { PageHeader } from "../components/ui";
import { CanvasAdminPanel } from "../components/CanvasAdminPanel";

export default function CanvasAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Canvas Admin"
        subtitle="Operator write-side for canvas primitives — create canvas, lookup by id, node create/update/delete, edge create. Coexists with the existing Canvas Operator browser."
        icon={<LayoutGrid className="h-5 w-5" />}
      />
      <CanvasAdminPanel />
    </div>
  );
}
