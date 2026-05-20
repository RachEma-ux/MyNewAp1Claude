/**
 * Vault Admin page — no-deferral continuation-27 slice 114.
 *
 * Global Agent Studio page reachable at `/agent-studio/vault-admin`.
 * Closes the partial-consumer gap on `vault.*` — 21 unconsumed
 * endpoints across membership / attachments / saved views / templates /
 * notes & search.
 *
 * Coexists with existing vault surfaces (BasesPanel α-shell, Vault
 * Attachments / Saved Views / Templates pages). This page surfaces
 * the operator admin chrome for the long-tail vault primitives.
 */

import { BookOpen } from "lucide-react";

import { PageHeader } from "../components/ui";
import { VaultAdminPanel } from "../components/VaultAdminPanel";

export default function VaultAdminPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Vault Admin"
        subtitle="Long-tail vault operator surface: membership / attachments / saved-view + blueprint lookup / template instantiations / note search + export + import + delete + backfill links."
        icon={<BookOpen className="h-5 w-5" />}
      />
      <VaultAdminPanel />
    </div>
  );
}
