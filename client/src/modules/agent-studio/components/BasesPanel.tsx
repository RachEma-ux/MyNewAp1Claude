/**
 * Bases panel — T-F.91 (T-F.2-α).
 *
 * First operator UI for Bases — database-view-style filtered note
 * browsers. The α-shell ships **read-only**:
 *   1. Vault picker (reuses `vault.listMyVaults`).
 *   2. Stats Card — bases count for the selected vault.
 *   3. List Card — recent bases (limit `BASES_LIST_LIMIT`).
 *
 * Bases are persisted as `agsVaultSavedViews` rows with
 * `viewKind="base"`. The discriminator approach is the cheapest
 * valuable α-shell — the existing `listVisibleSavedViews` tRPC
 * accepts `viewKind` filter, so zero new server work is needed.
 *
 * Follow-up slices (β/γ/δ) add: per-row drill-in detail view,
 * create-base form, edit / share / version-history wiring (the
 * Phase 16 saved-view CRUD + sharing model carries over).
 */

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

/**
 * Discriminator for the `agsVaultSavedViews.viewKind` column. Kept
 * as a sourcable constant so the source-scan test can lock the
 * value the server expects.
 */
const BASE_VIEW_KIND = "base" as const;
const BASES_LIST_LIMIT = 50;

export function BasesPanel() {
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const effectiveVaultId =
    selectedVaultId !== null
      ? selectedVaultId
      : vaults.length > 0
        ? vaults[0].id
        : null;

  const basesQuery = trpc.agentStudio.vault.listVisibleSavedViews.useQuery(
    effectiveVaultId !== null
      ? {
          vaultId: effectiveVaultId,
          viewKind: BASE_VIEW_KIND,
          limit: BASES_LIST_LIMIT,
        }
      : (undefined as never),
    {
      enabled: effectiveVaultId !== null,
      refetchOnWindowFocus: false,
    },
  );

  if (vaultsQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading vaults…</p>
    );
  }
  if (vaultsQuery.error) {
    return (
      <p
        className="text-sm text-destructive"
        data-testid="bases-vaults-error"
      >
        Failed to load vaults: {vaultsQuery.error.message}
      </p>
    );
  }
  if (vaults.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground italic"
        data-testid="bases-no-vaults"
      >
        No vaults yet — create a vault before creating bases.
      </p>
    );
  }

  const bases = basesQuery.data ?? [];
  const reachedLimit = bases.length === BASES_LIST_LIMIT;

  return (
    <div className="space-y-4" data-testid="bases-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Vault</SectionLabel>
          <select
            data-testid="bases-vault-select"
            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-sm"
            value={effectiveVaultId ?? ""}
            onChange={(e) => setSelectedVaultId(Number(e.target.value))}
          >
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Totals</SectionLabel>
          <div className="grid grid-cols-1 gap-3 text-sm" data-testid="bases-totals">
            <div>
              <p className="text-xs text-muted-foreground">bases</p>
              <p
                className="text-lg font-medium"
                data-testid="bases-totals-count"
              >
                {basesQuery.isLoading
                  ? "…"
                  : bases.length.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Recent bases
            {basesQuery.data
              ? reachedLimit
                ? ` (first ${BASES_LIST_LIMIT}, newest first)`
                : ` (${bases.length}, newest first)`
              : ""}
          </SectionLabel>
          {basesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading bases…</p>
          ) : basesQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="bases-list-error"
            >
              Failed to load bases: {basesQuery.error.message}
            </p>
          ) : bases.length === 0 ? (
            <p
              className="text-sm text-muted-foreground italic"
              data-testid="bases-list-empty"
            >
              No bases yet in this vault — the create flow lands in a
              follow-up slice.
            </p>
          ) : (
            <table className="w-full text-xs" data-testid="bases-list">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">id</th>
                  <th className="py-1">name</th>
                  <th className="py-1">visibility</th>
                  <th className="py-1">version</th>
                  <th className="py-1">updated</th>
                </tr>
              </thead>
              <tbody>
                {bases.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-border"
                    data-testid={`bases-row-${b.id}`}
                  >
                    <td className="py-1 font-mono">{b.id}</td>
                    <td className="py-1">{b.name}</td>
                    <td className="py-1 font-mono text-muted-foreground">
                      {b.visibility}
                    </td>
                    <td className="py-1 font-mono">v{b.version}</td>
                    <td className="py-1 font-mono text-muted-foreground">
                      {new Date(b.updatedAt).toISOString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
