/**
 * Vault Attachments admin page — V1+ 15-δ slice (PR-V1-83).
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/vault-attachments`. Operators pick a vault from
 * the dropdown (populated by `agentStudio.vault.listMyVaults`),
 * then the page renders <VaultAttachmentsAdminSurface vaultId>
 * which composes #816 AttachmentQuotaPanel + #796 AttachmentListPanel.
 *
 * Pattern mirrors GraphWorkspacePage — single PageHeader + content.
 * No agentId in scope; the picker drives the workspace.
 */

import { useState, useMemo } from "react";
import { Folder } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { PageHeader } from "../components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { VaultAttachmentsAdminSurface } from "../components/VaultAttachmentsAdminSurface";

export default function VaultAttachmentsPage() {
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);

  // Default to first vault once loaded.
  const effectiveVaultId =
    selectedVaultId !== null
      ? selectedVaultId
      : vaults.length > 0
        ? vaults[0].id
        : null;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Vault Attachments"
        subtitle="Per-vault attachment storage admin — quota usage + attachment list. The displayed quota matches the createAttachment write-gate threshold bit-for-bit."
        icon={<Folder className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="p-4">
          <label
            htmlFor="vault-attachments-page-vault-select"
            className="text-sm font-medium block mb-2"
          >
            Vault
          </label>
          {vaultsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading vaults…</p>
          ) : vaultsQuery.error ? (
            <p className="text-sm text-destructive">
              Failed to load vaults: {vaultsQuery.error.message}
            </p>
          ) : vaults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No vaults found. Create a vault before managing attachments.
            </p>
          ) : (
            <select
              id="vault-attachments-page-vault-select"
              data-testid="vault-attachments-page-vault-select"
              className="w-full rounded border bg-background p-2 text-sm"
              value={effectiveVaultId ?? ""}
              onChange={(e) => setSelectedVaultId(Number(e.target.value))}
            >
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} (#{v.id})
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {effectiveVaultId !== null && (
        <VaultAttachmentsAdminSurface vaultId={effectiveVaultId} />
      )}
    </div>
  );
}
