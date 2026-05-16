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

import { Fragment, useMemo, useState } from "react";

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
/**
 * Closed taxonomy for the bases ownerScope drill-in. Mirrors the
 * server-side `listVisibleSavedViews` Zod enum
 * (`ownerScope: z.enum(["mine", "all"]).optional()`). T-F.93 ships
 * UI surfacing of this existing server input — no server change.
 */
const OWNER_SCOPE_VALUES = ["mine", "all"] as const;
type OwnerScopeFilter = (typeof OWNER_SCOPE_VALUES)[number];

export function BasesPanel() {
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  // T-F.92 (T-F.2-β): per-row expand-to-detail. Only one row's
  // detail is open at a time (mirrors the Quality Lens θ trail
  // expansion shape, lesson 56's mutual-exclusion pattern). The
  // detail rows are rendered from already-fetched data — no new
  // tRPC query, no DB hit. Saved-view rows from
  // `listVisibleSavedViews` already carry filters / sort / columns
  // JSON.
  const [expandedBaseId, setExpandedBaseId] = useState<number | null>(null);
  // T-F.93 (T-F.2-γ): ownerScope drill-in — server-side narrowing
  // through the existing `ownerScope` Zod input. Default is "all"
  // (no narrowing); operator toggles to "mine" to scope to bases
  // they own (workspace_shared bases from others drop off).
  const [ownerScopeFilter, setOwnerScopeFilter] =
    useState<OwnerScopeFilter>("all");
  const hasOwnerScopeFilter = ownerScopeFilter !== "all";
  function clearOwnerScopeFilter() {
    setOwnerScopeFilter("all");
  }
  // T-F.95 (T-F.2-ε): per-row rename inline editor. Parallel state
  // slices (rather than discriminated) per lesson 55, mirroring the
  // Quality Lens η/ε editor pattern. Mutual exclusion with the
  // row-detail-expand toggle: opening rename clears expandedBaseId
  // so the row's state is always one of {none / detail / rename}.
  const [renameBaseId, setRenameBaseId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);
  function openRenameEditor(baseId: number, currentName: string) {
    setRenameBaseId(baseId);
    setRenameDraft(currentName);
    setRenameError(null);
    setExpandedBaseId(null);
    setConfirmDeleteBaseId(null);
  }
  function closeRenameEditor() {
    setRenameBaseId(null);
    setRenameDraft("");
  }
  // T-F.96 (T-F.2-η): per-row delete two-step confirm. The Delete…
  // button opens an inline confirmation prompt before the mutation
  // fires so a single click can't lose data (precedent: legacy
  // operator-runtime delete flows in this codebase). Single-row
  // confirmId so the prompt is always one-of-three with
  // expandedBaseId / renameBaseId.
  const [confirmDeleteBaseId, setConfirmDeleteBaseId] = useState<
    number | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  function openDeleteConfirm(baseId: number) {
    setConfirmDeleteBaseId(baseId);
    setDeleteError(null);
    setRenameBaseId(null);
    setRenameDraft("");
    setExpandedBaseId(null);
  }
  function closeDeleteConfirm() {
    setConfirmDeleteBaseId(null);
  }
  // T-F.94 (T-F.2-δ): first mutation — create base. The form is
  // inline (no modal); shows on "New base" click and collapses on
  // Create-success or Cancel. The δ-slice ships name-only to unblock
  // the page for first-use; filters / columns / visibility editing
  // land in follow-up slices (β-detail-view already renders these
  // when populated).
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createNameDraft, setCreateNameDraft] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);
  function openCreateForm() {
    setCreateOpen(true);
    setCreateNameDraft("");
    setCreateError(null);
  }
  function closeCreateForm() {
    setCreateOpen(false);
    setCreateNameDraft("");
  }
  const effectiveVaultId =
    selectedVaultId !== null
      ? selectedVaultId
      : vaults.length > 0
        ? vaults[0].id
        : null;

  const utils = trpc.useUtils();
  const createMutation =
    trpc.agentStudio.vault.createSavedView.useMutation({
      onSuccess: () => {
        setCreateError(null);
        closeCreateForm();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setCreateError(err.message),
    });
  const renameMutation =
    trpc.agentStudio.vault.updateSavedView.useMutation({
      onSuccess: () => {
        setRenameError(null);
        closeRenameEditor();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setRenameError(err.message),
    });
  const deleteMutation =
    trpc.agentStudio.vault.deleteSavedView.useMutation({
      onSuccess: () => {
        setDeleteError(null);
        closeDeleteConfirm();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setDeleteError(err.message),
    });
  const basesQuery = trpc.agentStudio.vault.listVisibleSavedViews.useQuery(
    effectiveVaultId !== null
      ? {
          vaultId: effectiveVaultId,
          viewKind: BASE_VIEW_KIND,
          limit: BASES_LIST_LIMIT,
          ...(ownerScopeFilter !== "all"
            ? { ownerScope: ownerScopeFilter }
            : {}),
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
          <div className="flex items-center justify-between">
            <SectionLabel>Bases in this vault</SectionLabel>
            {!createOpen ? (
              <button
                type="button"
                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                data-testid="bases-create-button"
                disabled={createMutation.isPending}
                onClick={openCreateForm}
              >
                New base…
              </button>
            ) : null}
          </div>
          {createOpen ? (
            <div
              className="space-y-2 rounded border border-border bg-muted/20 p-2 text-xs"
              data-testid="bases-create-form"
            >
              <label
                className="block text-muted-foreground"
                htmlFor="bases-create-name-input"
              >
                Base name (max 255 chars):
              </label>
              <input
                id="bases-create-name-input"
                data-testid="bases-create-name-input"
                type="text"
                className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                maxLength={255}
                value={createNameDraft}
                onChange={(e) => setCreateNameDraft(e.target.value)}
                disabled={createMutation.isPending}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    createMutation.isPending ||
                    createNameDraft.trim() === "" ||
                    effectiveVaultId === null
                  }
                  className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                  data-testid="bases-create-confirm"
                  onClick={() => {
                    const trimmed = createNameDraft.trim();
                    if (trimmed === "" || effectiveVaultId === null) return;
                    createMutation.mutate({
                      vaultId: effectiveVaultId,
                      name: trimmed,
                      viewKind: BASE_VIEW_KIND,
                    });
                  }}
                >
                  {createMutation.isPending ? "Creating…" : "Create base"}
                </button>
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  className="underline text-muted-foreground disabled:opacity-50"
                  data-testid="bases-create-cancel"
                  onClick={closeCreateForm}
                >
                  Cancel
                </button>
                <span className="ml-auto text-muted-foreground">
                  {createNameDraft.length} / 255
                </span>
              </div>
              {createError ? (
                <p
                  className="text-destructive"
                  data-testid="bases-create-error"
                >
                  Create failed: {createError}
                </p>
              ) : null}
            </div>
          ) : null}
          <SectionLabel>
            Recent bases
            {basesQuery.data
              ? reachedLimit
                ? hasOwnerScopeFilter
                  ? ` (first ${BASES_LIST_LIMIT} matching scope, newest first)`
                  : ` (first ${BASES_LIST_LIMIT}, newest first)`
                : hasOwnerScopeFilter
                  ? ` (${bases.length} matching scope, newest first)`
                  : ` (${bases.length}, newest first)`
              : ""}
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className="flex items-center gap-2"
              data-testid="bases-owner-scope-filter-group"
            >
              <span className="text-muted-foreground">scope:</span>
              {OWNER_SCOPE_VALUES.map((mode) => {
                const isActive = ownerScopeFilter === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`bases-owner-scope-filter-${mode}`}
                    onClick={() => setOwnerScopeFilter(mode)}
                    className={`rounded px-2 py-0.5 font-mono ${
                      isActive
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            {hasOwnerScopeFilter ? (
              <button
                type="button"
                className="ml-auto underline text-muted-foreground"
                data-testid="bases-clear-owner-scope-filter"
                onClick={clearOwnerScopeFilter}
              >
                Clear filter
              </button>
            ) : null}
          </div>
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
              {hasOwnerScopeFilter ? (
                <>
                  No bases match the active scope filter.{" "}
                  <button
                    type="button"
                    className="underline not-italic"
                    data-testid="bases-empty-state-clear-owner-scope"
                    onClick={clearOwnerScopeFilter}
                  >
                    Clear filter
                  </button>
                </>
              ) : (
                <>
                  No bases yet in this vault — the create flow lands in a
                  follow-up slice.
                </>
              )}
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
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {bases.map((b) => {
                  const isExpanded = expandedBaseId === b.id;
                  const isRenaming = renameBaseId === b.id;
                  const isRenamePending =
                    renameMutation.isPending &&
                    renameMutation.variables?.id === b.id;
                  const isConfirmingDelete = confirmDeleteBaseId === b.id;
                  const isDeletePending =
                    deleteMutation.isPending &&
                    deleteMutation.variables?.viewId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr
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
                        <td className="py-1 space-x-2">
                          <button
                            type="button"
                            className="underline text-muted-foreground"
                            data-testid={`bases-row-toggle-${b.id}`}
                            onClick={() =>
                              setExpandedBaseId(isExpanded ? null : b.id)
                            }
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                          {!isRenaming ? (
                            <button
                              type="button"
                              disabled={isRenamePending}
                              className="underline text-muted-foreground disabled:opacity-50"
                              data-testid={`bases-row-rename-${b.id}`}
                              onClick={() => openRenameEditor(b.id, b.name)}
                            >
                              Rename…
                            </button>
                          ) : null}
                          {!isConfirmingDelete ? (
                            <button
                              type="button"
                              disabled={isDeletePending}
                              className="underline text-destructive disabled:opacity-50"
                              data-testid={`bases-row-delete-${b.id}`}
                              onClick={() => openDeleteConfirm(b.id)}
                            >
                              Delete…
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr data-testid={`bases-row-detail-${b.id}`}>
                          <td colSpan={6} className="bg-muted/20 px-3 py-2 text-xs">
                            <BaseRowDetail base={b} />
                          </td>
                        </tr>
                      ) : null}
                      {isRenaming ? (
                        <tr data-testid={`bases-row-rename-row-${b.id}`}>
                          <td
                            colSpan={6}
                            className="bg-muted/20 px-3 py-2 text-xs"
                          >
                            <div className="space-y-2">
                              <label
                                className="block text-muted-foreground"
                                htmlFor={`bases-row-rename-input-${b.id}`}
                              >
                                Rename base (max 255 chars):
                              </label>
                              <input
                                id={`bases-row-rename-input-${b.id}`}
                                data-testid={`bases-row-rename-input-${b.id}`}
                                type="text"
                                className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                                maxLength={255}
                                value={renameDraft}
                                onChange={(e) =>
                                  setRenameDraft(e.target.value)
                                }
                                disabled={isRenamePending}
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    isRenamePending ||
                                    renameDraft.trim() === "" ||
                                    renameDraft.trim() === b.name
                                  }
                                  className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                                  data-testid={`bases-row-rename-confirm-${b.id}`}
                                  onClick={() => {
                                    const trimmed = renameDraft.trim();
                                    if (trimmed === "" || trimmed === b.name)
                                      return;
                                    renameMutation.mutate({
                                      id: b.id,
                                      name: trimmed,
                                    });
                                  }}
                                >
                                  {isRenamePending
                                    ? "Renaming…"
                                    : "Confirm rename"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isRenamePending}
                                  className="underline text-muted-foreground disabled:opacity-50"
                                  data-testid={`bases-row-rename-cancel-${b.id}`}
                                  onClick={closeRenameEditor}
                                >
                                  Cancel
                                </button>
                                <span className="ml-auto text-muted-foreground">
                                  {renameDraft.length} / 255
                                </span>
                              </div>
                              {renameError ? (
                                <p
                                  className="text-destructive"
                                  data-testid={`bases-row-rename-error-${b.id}`}
                                >
                                  Rename failed: {renameError}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {isConfirmingDelete ? (
                        <tr
                          data-testid={`bases-row-delete-row-${b.id}`}
                        >
                          <td
                            colSpan={6}
                            className="bg-destructive/10 px-3 py-2 text-xs"
                          >
                            <div className="space-y-2">
                              <p
                                className="text-destructive"
                                data-testid={`bases-row-delete-prompt-${b.id}`}
                              >
                                Delete base <strong>{b.name}</strong> (id{" "}
                                {b.id})? This cannot be undone.
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isDeletePending}
                                  className="rounded bg-destructive px-2 py-0.5 text-destructive-foreground disabled:opacity-50"
                                  data-testid={`bases-row-delete-confirm-${b.id}`}
                                  onClick={() =>
                                    deleteMutation.mutate({ viewId: b.id })
                                  }
                                >
                                  {isDeletePending
                                    ? "Deleting…"
                                    : "Confirm delete"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeletePending}
                                  className="underline text-muted-foreground disabled:opacity-50"
                                  data-testid={`bases-row-delete-cancel-${b.id}`}
                                  onClick={closeDeleteConfirm}
                                >
                                  Cancel
                                </button>
                              </div>
                              {deleteError ? (
                                <p
                                  className="text-destructive"
                                  data-testid={`bases-row-delete-error-${b.id}`}
                                >
                                  Delete failed: {deleteError}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * T-F.92 (T-F.2-β) BaseRowDetail — inline detail expansion for a
 * bases-list row. Renders the base's filters / sort / columns /
 * metadata from already-fetched `SavedViewRow` data (no new
 * tRPC query, no DB hit).
 */
function BaseRowDetail({
  base,
}: {
  readonly base: {
    readonly id: number;
    readonly viewKind: string;
    readonly filters: Record<string, unknown> | null;
    readonly sort: Record<string, unknown> | null;
    readonly columns: readonly string[] | null;
    readonly createdAt: string | Date;
    readonly ownerUserId: number | null;
    readonly parentSavedViewId: number | null;
  };
}) {
  return (
    <div
      className="space-y-3"
      data-testid={`bases-row-detail-body-${base.id}`}
    >
      <div>
        <p className="font-medium">Metadata</p>
        <ul
          className="ml-3 list-disc text-muted-foreground"
          data-testid={`bases-row-detail-meta-${base.id}`}
        >
          <li>viewKind: {base.viewKind}</li>
          <li>
            createdAt: {new Date(base.createdAt).toISOString()}
          </li>
          <li>
            ownerUserId:{" "}
            {base.ownerUserId !== null ? `user#${base.ownerUserId}` : "—"}
          </li>
          {base.parentSavedViewId !== null ? (
            <li>parentSavedViewId: {base.parentSavedViewId}</li>
          ) : null}
        </ul>
      </div>
      <div>
        <p className="font-medium">Filters</p>
        {base.filters && Object.keys(base.filters).length > 0 ? (
          <pre
            className="mt-1 max-h-40 overflow-auto rounded bg-background/50 p-2 font-mono text-[10px]"
            data-testid={`bases-row-detail-filters-${base.id}`}
          >
            {JSON.stringify(base.filters, null, 2)}
          </pre>
        ) : (
          <p
            className="text-muted-foreground italic"
            data-testid={`bases-row-detail-filters-empty-${base.id}`}
          >
            No filters — base matches all notes in the vault.
          </p>
        )}
      </div>
      <div>
        <p className="font-medium">Sort</p>
        {base.sort && Object.keys(base.sort).length > 0 ? (
          <pre
            className="mt-1 max-h-32 overflow-auto rounded bg-background/50 p-2 font-mono text-[10px]"
            data-testid={`bases-row-detail-sort-${base.id}`}
          >
            {JSON.stringify(base.sort, null, 2)}
          </pre>
        ) : (
          <p
            className="text-muted-foreground italic"
            data-testid={`bases-row-detail-sort-empty-${base.id}`}
          >
            No sort — default order.
          </p>
        )}
      </div>
      <div>
        <p className="font-medium">
          Columns ({base.columns?.length ?? 0})
        </p>
        {base.columns && base.columns.length > 0 ? (
          <ul
            className="ml-3 list-disc text-muted-foreground"
            data-testid={`bases-row-detail-columns-${base.id}`}
          >
            {base.columns.map((c) => (
              <li key={c} className="font-mono">
                {c}
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-muted-foreground italic"
            data-testid={`bases-row-detail-columns-empty-${base.id}`}
          >
            No columns selected — base renders the view-kind defaults.
          </p>
        )}
      </div>
    </div>
  );
}
