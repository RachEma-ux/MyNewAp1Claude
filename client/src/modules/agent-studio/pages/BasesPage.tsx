/**
 * Bases page — T-F.91 (T-F.2-α).
 *
 * First operator surface for Bases (database-view-style saved
 * filters on vault notes). Reaches `/agent-studio/bases` via the
 * canonical 4-site shell wiring (lazy import in
 * `AgentStudioShell.tsx`, path parser in the same file, sidebar
 * entry in `AgentStudioSidebar.tsx`, route case in `routes.tsx`).
 *
 * α-shell ships read-only — bases are saved views with
 * `viewKind="base"` discriminator (per the `agsVaultSavedViews`
 * doc-comment that explicitly anticipates additional view kinds
 * without DB churn). Create / edit / share lands in β/γ/δ.
 *
 * The real content lives in `BasesPanel`.
 */

import { BasesPanel } from "../components/BasesPanel";

export default function BasesPage() {
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">Bases</h2>
      <BasesPanel />
    </div>
  );
}
