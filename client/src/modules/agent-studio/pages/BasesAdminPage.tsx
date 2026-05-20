/**
 * Bases Admin (canonical CRUD) page — no-deferral continuation-21 slice 96.
 *
 * Global Agent Studio page reachable at `/agent-studio/bases-admin`.
 * Closes the final UI-consumer gap from the slice-83 audit by
 * surfacing the 10-endpoint `bases.*` CRUD over the Phase 24 MVP
 * `ags_bases` / `ags_base_columns` / `ags_base_rows` data model.
 *
 * Coexists with the existing T-F.91 / T-F.2-α `BasesPage` (saved-
 * view α-shell with filter-language UX). See continuation-21
 * catalogue for the coexistence rationale.
 */

import { Table2 } from "lucide-react";

import { PageHeader } from "../components/ui";
import { BasesAdminPanel } from "../components/BasesAdminPanel";

export default function BasesAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Bases Admin (canonical)"
        subtitle="Phase 24 MVP CRUD surface for ags_bases / ags_base_columns / ags_base_rows. Distinct from the saved-view α-shell at /agent-studio/bases."
        icon={<Table2 className="h-5 w-5" />}
      />
      <BasesAdminPanel />
    </div>
  );
}
