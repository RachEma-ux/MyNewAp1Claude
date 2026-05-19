/**
 * Vault Templates admin page — no-deferral continuation-7 slice 53.
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/vault-templates`. Sibling of `VaultSavedViewsPage`
 * (#) + `VaultAttachmentsPage` (#) — the third vault admin surface
 * promoted from "panel embedded in RetrofitPage" to a first-class
 * page with its own route + sidebar entry.
 *
 * The `VaultTemplatesPanel` (Phase 15 backend at `seedVaultTemplateRows`
 * + the `vault.listTemplates` / `vault.createTemplate` tRPC) already
 * handles its own vault filtering via a numeric input, so this page
 * is intentionally a thin wrapper — header + panel. A vault picker
 * mirroring `VaultSavedViewsPage` could be a follow-on, but is not
 * required for the templates flow (templates are global by default;
 * vault scoping is optional).
 */

import { FileText } from "lucide-react";

import { PageHeader } from "../components/ui";
import { VaultTemplatesPanel } from "../components/VaultTemplatesPanel";

export default function VaultTemplatesPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Vault Templates"
        subtitle="Seeded + operator-authored markdown templates. Scope the listing by entering a vault id, or open the new-template dialog below."
        icon={<FileText className="h-5 w-5" />}
      />
      <VaultTemplatesPanel />
    </div>
  );
}
