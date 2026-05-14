/**
 * Vault Saved Views admin page — V1+ 16-δ slice (PR-V1-85).
 *
 * Global Agent Studio page (no agentId context) reachable at
 * `/agent-studio/vault-saved-views`. Mirrors VaultAttachmentsPage
 * (#834) — a vault picker drives `listVisibleSavedViews` for that
 * vault, then a saved-view picker selects which view's history to
 * inspect, then renders <SavedViewVersionHistoryPanel
 * savedViewId={…} /> from #795.
 *
 * The two-picker shape (vault, then saved-view) reflects the data
 * model — saved views are scoped to a vault, and operators
 * typically know the vault first.
 */

import { useMemo, useState } from "react";
import { GitBranch } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { PageHeader } from "../components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { SavedViewVersionHistoryPanel } from "../components/SavedViewVersionHistoryPanel";

export default function VaultSavedViewsPage() {
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const effectiveVaultId =
    selectedVaultId !== null
      ? selectedVaultId
      : vaults.length > 0
        ? vaults[0].id
        : null;

  const savedViewsQuery = trpc.agentStudio.vault.listVisibleSavedViews.useQuery(
    effectiveVaultId !== null
      ? { vaultId: effectiveVaultId }
      : (undefined as never),
    { enabled: effectiveVaultId !== null, refetchOnWindowFocus: false },
  );
  const savedViews = useMemo(
    () => savedViewsQuery.data ?? [],
    [savedViewsQuery.data],
  );
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<number | null>(
    null,
  );
  const effectiveSavedViewId =
    selectedSavedViewId !== null
      ? selectedSavedViewId
      : savedViews.length > 0
        ? savedViews[0].id
        : null;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Vault Saved Views"
        subtitle="Per-saved-view immutable version history — every updateSavedView captures the prior snapshot for audit + restore."
        icon={<GitBranch className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <label
              htmlFor="vault-saved-views-page-vault-select"
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
                No vaults found.
              </p>
            ) : (
              <select
                id="vault-saved-views-page-vault-select"
                data-testid="vault-saved-views-page-vault-select"
                className="w-full rounded border bg-background p-2 text-sm"
                value={effectiveVaultId ?? ""}
                onChange={(e) => {
                  setSelectedVaultId(Number(e.target.value));
                  setSelectedSavedViewId(null);
                }}
              >
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (#{v.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {effectiveVaultId !== null && (
            <div>
              <label
                htmlFor="vault-saved-views-page-saved-view-select"
                className="text-sm font-medium block mb-2"
              >
                Saved view
              </label>
              {savedViewsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading saved views…
                </p>
              ) : savedViewsQuery.error ? (
                <p className="text-sm text-destructive">
                  Failed to load saved views: {savedViewsQuery.error.message}
                </p>
              ) : savedViews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved views in this vault.
                </p>
              ) : (
                <select
                  id="vault-saved-views-page-saved-view-select"
                  data-testid="vault-saved-views-page-saved-view-select"
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={effectiveSavedViewId ?? ""}
                  onChange={(e) =>
                    setSelectedSavedViewId(Number(e.target.value))
                  }
                >
                  {savedViews.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name} (#{sv.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {effectiveSavedViewId !== null && (
        <SavedViewVersionHistoryPanel savedViewId={effectiveSavedViewId} />
      )}
    </div>
  );
}
