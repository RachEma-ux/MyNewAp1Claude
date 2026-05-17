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

/**
 * T-B.6 — saved-views Lens registry preview deeplink mapping.
 *
 * Client-side mirror of the server's `VIEW_KIND_BLUEPRINTS`
 * `defaultLensKind` column (server/agent-studio/services/vault/
 * view-kind-blueprints.ts). Only the 4 non-null mappings are
 * mirrored here — viewKinds not in the map (note_list, base,
 * plus any future user-defined kinds) get no deeplink button.
 *
 * Why mirrored not fetched: the server table is a 6-entry pure
 * constant with zero runtime branching; a tRPC roundtrip per
 * saved-view selection would be pointless overhead. The lockstep
 * source-scan test (vault-saved-views-lens-preview.test.ts)
 * locks the mirror against the server file so any future
 * blueprint edit surfaces drift before merge.
 *
 * Composes with the T-F.135 URL-deeplink primitive on the
 * receiving end (`readLensIdFromUrl` in GraphLensBrowserPanel).
 */
const DEFAULT_LENS_KIND_BY_VIEW_KIND: Readonly<Record<string, string>> = {
  entity_list: "institutional_memory",
  runtime_asset_list: "runtime",
  graph_quality: "governance",
  projection_status: "governance",
};

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

  // T-B.6 — resolve the selected saved view to its viewKind, then
  // look up the canonical lens kind for that viewKind. Returns null
  // when the view-kind has no canonical lens (e.g., `note_list`,
  // `base`) — the Preview button only renders when a lens exists.
  const previewLensKind = useMemo<string | null>(() => {
    if (effectiveSavedViewId === null) return null;
    const sv = savedViews.find((s) => s.id === effectiveSavedViewId);
    if (!sv) return null;
    return DEFAULT_LENS_KIND_BY_VIEW_KIND[sv.viewKind] ?? null;
  }, [effectiveSavedViewId, savedViews]);

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

      {/* T-B.6 — Preview-in-Lens button. Renders only when the
          selected saved view's viewKind has a canonical Phase 24
          lens (per server VIEW_KIND_BLUEPRINTS.defaultLensKind).
          Deeplinks through the T-F.135 URL-state primitive
          (`?lensId=X` on the receiving panel). */}
      {previewLensKind !== null && (
        <Card>
          <CardContent className="p-4">
            <a
              href={`/agent-studio/graph-lens-browser?lensId=${encodeURIComponent(previewLensKind)}`}
              data-testid="vault-saved-views-preview-in-lens-link"
              className="inline-block rounded border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
              title={`Open the ${previewLensKind} lens in the Graph Lens Browser`}
            >
              Preview in {previewLensKind} Lens →
            </a>
          </CardContent>
        </Card>
      )}

      {effectiveSavedViewId !== null && (
        <SavedViewVersionHistoryPanel savedViewId={effectiveSavedViewId} />
      )}
    </div>
  );
}
