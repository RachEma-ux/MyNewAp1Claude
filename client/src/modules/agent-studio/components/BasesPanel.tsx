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
import {
  FilterDocumentSchema,
  parseFilterDocument,
  applyFilterDocument,
  extractFolderIdConstraint,
  type FilterCondition,
  type FilterDocument,
  type FilterableNote,
} from "@shared/bases-filter-language";

/**
 * Discriminator for the `agsVaultSavedViews.viewKind` column. Kept
 * as a sourcable constant so the source-scan test can lock the
 * value the server expects.
 */
const BASE_VIEW_KIND = "base" as const;
const BASES_LIST_LIMIT = 50;
/**
 * T-F.98 (T-F.2-ζ): cap on the apply-filter preview. Smaller than
 * the bases list cap because the preview is "show me what the base
 * would render" — operators don't need all 200 notes inline, just a
 * confidence-check sample.
 */
const PREVIEW_LIMIT = 25;
/**
 * T-F.102 (T-F.2-filter-δ): server-side fetch over-sample for the
 * preview path. The server-side `vault.listNotes` can enforce
 * `folderId` only; remaining V1 conditions narrow client-side. To
 * avoid the "first 25 then narrow to N" pathological case (which
 * would silently drop matches), fetch up to the server's max
 * (`vault.listNotes` accepts `limit ≤ 200`), apply the typed
 * conditions client-side, then slice to PREVIEW_LIMIT for display.
 *
 * The over-sample is honest: if the matching set exceeds 200 even
 * after server-side folderId narrowing, the operator sees the
 * first 200's narrow result, NOT a randomly-sampled subset. A
 * future server-side query builder (V1.5) eliminates the
 * over-sample by pushing all conditions to the DB.
 */
const PREVIEW_FETCH_OVER_SAMPLE = 200;
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
  // T-F.117 (T-F.2-ζ.1): bulk-selection model. Mirrors Quality Lens
  // T-F.89 / Inbox T-F.111. `Set<number>` selection state with O(1)
  // toggle, status-independent (works on all bases regardless of
  // expand/rename/edit state per lesson 69 inspection-mutation
  // orthogonality). Bulk-action UX + server bulk-delete endpoint
  // land in ζ.2 (T-F.118).
  const [selectedBaseIds, setSelectedBaseIds] = useState<Set<number>>(
    () => new Set(),
  );
  function toggleBaseSelection(id: number): void {
    setSelectedBaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearBaseSelection(): void {
    setSelectedBaseIds(new Set());
  }

  // T-F.116 (T-F.2-a.4-narrow): closeAllRowEdits refactor (lesson 65
  // trigger at N=5 row-mutation slices). Centralises the cross-
  // clear that every open* helper performs so adding the 6th
  // mutation slice doesn't grow each helper by another 2 setStates.
  // Resets the 5 mutation-input slices only — does NOT touch
  // expandedBaseId (detail-expand is inspection state — lesson 69
  // independence) and does NOT touch previewBaseId /
  // openPreviewNoteId / shareError* (preview is also inspection,
  // share error is per-row mutation-side-effect, both orthogonal
  // to the row-edit one-of-N invariant). Whether to ALSO clear
  // expandedBaseId stays in the caller (rename + delete clear it;
  // filter/sort/columns editors don't because they live INSIDE
  // the detail expansion).
  function closeAllRowEdits() {
    setRenameBaseId(null);
    setRenameDraft("");
    setRenameError(null);
    setConfirmDeleteBaseId(null);
    setDeleteError(null);
    setFilterEditBaseId(null);
    setFilterEditDraft("");
    setFilterEditError(null);
    setSortEditBaseId(null);
    setSortEditDraft("");
    setSortEditError(null);
    setColumnsEditBaseId(null);
    setColumnsEditDraft("");
    setColumnsEditError(null);
  }
  function openRenameEditor(baseId: number, currentName: string) {
    closeAllRowEdits();
    setExpandedBaseId(null);
    setRenameBaseId(baseId);
    setRenameDraft(currentName);
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
    closeAllRowEdits();
    setExpandedBaseId(null);
    setConfirmDeleteBaseId(baseId);
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
  // T-F.97 (T-F.2-θ): per-row Share-flip mutation. Reuses
  // `updateSavedView` with a `visibility` patch only — no other
  // fields. One-click toggle (no two-step confirm); the action is
  // reversible (operator can flip back instantly), unlike delete.
  // Error surface stays per-row.
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareErrorBaseId, setShareErrorBaseId] = useState<number | null>(
    null,
  );
  // T-F.98 (T-F.2-ζ): apply-filter preview. INDEPENDENT of detail /
  // rename / delete-confirm slices — preview is read-only inspection,
  // not row mutation. Operator can preview a base while renaming it
  // (the rename editor lives above the preview row). Only one
  // preview open at a time across rows (single-id state).
  //
  // Filter-language gap is honest: only `filters.folderId` is
  // enforced today (the one input `vault.listNotes` accepts);
  // other JSON keys in `filters` are surfaced in the β detail view
  // but not yet narrowed. The preview banner names this gap.
  const [previewBaseId, setPreviewBaseId] = useState<number | null>(null);
  // T-F.104 (T-F.2-a.2-narrow): drill-into-note jump affordance. A
  // single noteId state slice; only one note's content panel is
  // expanded at a time within the preview. Independent of all
  // row-mutation slices (rename / delete / filter-edit) because the
  // open-note action is read-only inspection nested INSIDE the
  // preview (which is itself an inspection state — lesson 69).
  const [openPreviewNoteId, setOpenPreviewNoteId] = useState<number | null>(
    null,
  );
  // T-F.101 (T-F.2-filter-γ): inline filter editor on the β detail
  // row. Operator opens "Edit filters", textarea pre-populated with
  // the current JSON; Save validates against FilterDocumentSchema
  // (Zod) before calling updateSavedView. Invalid JSON or schema
  // mismatch surfaces a per-row error without round-tripping.
  // Mutually exclusive with rename / delete-confirm (filter-edit
  // is itself a row mutation). The edit form lives INSIDE the β
  // detail expansion row, so it requires the detail to be expanded.
  const [filterEditBaseId, setFilterEditBaseId] = useState<number | null>(
    null,
  );
  const [filterEditDraft, setFilterEditDraft] = useState<string>("");
  const [filterEditError, setFilterEditError] = useState<string | null>(null);
  function openFilterEditor(baseId: number, currentJson: string) {
    closeAllRowEdits();
    setFilterEditBaseId(baseId);
    setFilterEditDraft(currentJson);
  }
  function closeFilterEditor() {
    setFilterEditBaseId(null);
    setFilterEditDraft("");
    setFilterEditError(null);
  }
  // T-F.105 (T-F.2-a.3-narrow): typed-JSON editors for Sort +
  // Columns sections of the β detail view. Mirrors the γ
  // filter-edit pattern; per-stage Save validation
  // (JSON.parse → shape check → updateSavedView). At N=5
  // row-mutation slices, the cross-clear lists in each open*
  // helper grew long enough that a `closeAllRowEdits()` helper
  // would be a natural extraction (lesson 65) — deferred to a
  // separate refactor PR to keep this slice's diff focused on
  // the new editors.
  const [sortEditBaseId, setSortEditBaseId] = useState<number | null>(null);
  const [sortEditDraft, setSortEditDraft] = useState<string>("");
  const [sortEditError, setSortEditError] = useState<string | null>(null);
  const [columnsEditBaseId, setColumnsEditBaseId] = useState<number | null>(
    null,
  );
  const [columnsEditDraft, setColumnsEditDraft] = useState<string>("");
  const [columnsEditError, setColumnsEditError] = useState<string | null>(
    null,
  );
  function openSortEditor(baseId: number, currentJson: string) {
    closeAllRowEdits();
    setSortEditBaseId(baseId);
    setSortEditDraft(currentJson);
  }
  function closeSortEditor() {
    setSortEditBaseId(null);
    setSortEditDraft("");
    setSortEditError(null);
  }
  function openColumnsEditor(baseId: number, currentJson: string) {
    closeAllRowEdits();
    setColumnsEditBaseId(baseId);
    setColumnsEditDraft(currentJson);
  }
  function closeColumnsEditor() {
    setColumnsEditBaseId(null);
    setColumnsEditDraft("");
    setColumnsEditError(null);
  }
  const shareMutation =
    trpc.agentStudio.vault.updateSavedView.useMutation({
      onSuccess: () => {
        setShareError(null);
        setShareErrorBaseId(null);
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err, variables) => {
        setShareError(err.message);
        setShareErrorBaseId(variables.id);
      },
    });
  const filterEditMutation =
    trpc.agentStudio.vault.updateSavedView.useMutation({
      onSuccess: () => {
        setFilterEditError(null);
        closeFilterEditor();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setFilterEditError(err.message),
    });

  // ── T-F.118 (T-F.2-ζ.2): bulk-delete mutation + composite state ──
  // Single bulk gesture at a time (lesson 83 — bulk state collapses
  // to composite when bulk-actions are mutually exclusive). Confirm
  // is two-step per lesson 64 (destructive; N rows vanish).
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] =
    useState<boolean>(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<string | null>(null);
  const bulkDeleteMutation =
    trpc.agentStudio.vault.deleteSavedViews.useMutation({
      onSuccess: (res) => {
        setBulkDeleteError(null);
        setBulkDeleteResult(`Deleted ${res.deletedCount} base(s).`);
        setBulkDeleteConfirmOpen(false);
        clearBaseSelection();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => {
        setBulkDeleteError(err.message);
        setBulkDeleteResult(null);
      },
    });
  const sortEditMutation =
    trpc.agentStudio.vault.updateSavedView.useMutation({
      onSuccess: () => {
        setSortEditError(null);
        closeSortEditor();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setSortEditError(err.message),
    });
  const columnsEditMutation =
    trpc.agentStudio.vault.updateSavedView.useMutation({
      onSuccess: () => {
        setColumnsEditError(null);
        closeColumnsEditor();
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
      },
      onError: (err) => setColumnsEditError(err.message),
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
  // T-F.117 (T-F.2-ζ.1): derive header-checkbox state from the
  // currently-displayed slice. `pageAllSelected` is true iff every
  // visible base is in the selection set. Toggle behavior on
  // header click: select-all if any unselected; clear if all
  // selected (matches Quality Lens precedent).
  const pageAllSelected =
    bases.length > 0 && bases.every((b) => selectedBaseIds.has(b.id));
  function togglePageSelection(): void {
    if (pageAllSelected) {
      setSelectedBaseIds((prev) => {
        const next = new Set(prev);
        for (const b of bases) next.delete(b.id);
        return next;
      });
    } else {
      setSelectedBaseIds((prev) => {
        const next = new Set(prev);
        for (const b of bases) next.add(b.id);
        return next;
      });
    }
  }
  // T-F.98 (T-F.2-ζ): resolve the previewing base's row from the
  // already-fetched list so we can extract `filters.folderId`. Uses
  // `find` on the in-memory list — no extra round-trip.
  const previewBase =
    previewBaseId !== null
      ? bases.find((b) => b.id === previewBaseId) ?? null
      : null;
  // T-F.102 (T-F.2-filter-δ): parse the previewing base's filters
  // into a typed FilterDocument once per render. Null means
  // "couldn't validate against V1 schema (or legacy folderId
  // fallback)"; consumers treat null as match-all.
  const previewDoc: FilterDocument | null = previewBase
    ? parseFilterDocument(previewBase.filters)
    : null;
  // folderId is the only condition the server can enforce. Pulled
  // from the typed doc so legacy `{ folderId: N }` and typed
  // `{ version: 1, conditions: [...] }` both project transparently.
  const previewFolderId: number | undefined =
    extractFolderIdConstraint(previewDoc) ?? undefined;
  // When the doc parses, ALL V1 keys are enforced client-side via
  // `applyFilterDocument` — the unenforced-keys list shrinks to
  // zero. When the doc DOESN'T parse (operator wrote invalid JSON
  // into the filters column), fall back to T-F.98 behavior: list
  // the unparseable keys so the operator sees the gap.
  const unenforcedFilterKeys: readonly string[] =
    previewDoc !== null
      ? []
      : previewBase &&
          typeof previewBase.filters === "object" &&
          previewBase.filters !== null
        ? Object.keys(previewBase.filters as Record<string, unknown>).filter(
            (k) => k !== "folderId",
          )
        : [];
  const previewQuery = trpc.agentStudio.vault.listNotes.useQuery(
    previewBaseId !== null && effectiveVaultId !== null
      ? {
          vaultId: effectiveVaultId,
          // Over-sample server-side so client-side narrowing has
          // room to work; final display caps at PREVIEW_LIMIT.
          limit: PREVIEW_FETCH_OVER_SAMPLE,
          ...(previewFolderId !== undefined
            ? { folderId: previewFolderId }
            : {}),
        }
      : (undefined as never),
    {
      enabled: previewBaseId !== null && effectiveVaultId !== null,
      refetchOnWindowFocus: false,
    },
  );
  // Apply remaining typed conditions client-side. T-F.103
  // (a.1-narrow) splits this into "all matches in the fetched
  // sample" + "display slice (first PREVIEW_LIMIT)" so the banner
  // can report total + truncation state honestly.
  const previewMatchedAll: readonly (FilterableNote & {
    readonly id: number;
    readonly slug: string;
    readonly title: string;
    readonly governanceStatus: string;
    readonly updatedAt: string | Date;
  })[] = previewQuery.data
    ? applyFilterDocument(
        previewQuery.data as ReadonlyArray<
          FilterableNote & {
            readonly id: number;
            readonly slug: string;
            readonly title: string;
            readonly governanceStatus: string;
            readonly updatedAt: string | Date;
          }
        >,
        previewDoc,
      )
    : [];
  const previewNotes = previewMatchedAll.slice(0, PREVIEW_LIMIT);
  const previewTotalMatchCount = previewMatchedAll.length;
  const previewTruncatedByDisplay =
    previewTotalMatchCount > PREVIEW_LIMIT;
  // The over-sample fetch may itself have been capped by the
  // server-side `limit ≤ 200` Zod input — that means matches BEYOND
  // the first 200 rows in the vault are NOT considered. The banner
  // names this honestly so operators know to narrow filters or
  // visit the underlying list page.
  const previewTruncatedByFetchCap =
    previewQuery.data !== undefined &&
    previewQuery.data.length === PREVIEW_FETCH_OVER_SAMPLE;
  // T-F.104 (a.2-narrow): gated note-content fetch. Only fires when
  // an operator clicks "Open" on a preview row. Returns
  // `{ note, latestVersion }` — `latestVersion.contentMd` is the
  // markdown source rendered as plain text in the inline panel.
  const openNoteQuery = trpc.agentStudio.vault.getNote.useQuery(
    openPreviewNoteId !== null
      ? { noteId: openPreviewNoteId }
      : (undefined as never),
    {
      enabled: openPreviewNoteId !== null,
      refetchOnWindowFocus: false,
    },
  );

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
            <>
              {/* T-F.117 (T-F.2-ζ.1): selection bar gated on size > 0.
                  Names the count, offers Clear. Bulk-action button(s)
                  + server bulk-delete endpoint land in T-F.118 ζ.2. */}
              {selectedBaseIds.size > 0 ? (
                <div
                  className="mb-2 space-y-2 rounded border bg-muted/30 px-3 py-1.5 text-xs"
                  data-testid="bases-bulk-selection-bar"
                >
                  <div className="flex items-center gap-3">
                    <span data-testid="bases-bulk-selection-count">
                      {selectedBaseIds.size} selected
                    </span>
                    {/* T-F.118 (T-F.2-ζ.2): bulk-delete entry button +
                        two-step confirm. The confirm panel renders
                        inline below this row (lesson 64 — destructive,
                        explicit operator gesture). */}
                    {!bulkDeleteConfirmOpen ? (
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
                        disabled={bulkDeleteMutation.isPending}
                        onClick={() => {
                          setBulkDeleteError(null);
                          setBulkDeleteResult(null);
                          setBulkDeleteConfirmOpen(true);
                        }}
                        data-testid="bases-bulk-delete"
                      >
                        Delete {selectedBaseIds.size}…
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ml-auto underline text-muted-foreground"
                      onClick={clearBaseSelection}
                      data-testid="bases-bulk-selection-clear"
                    >
                      Clear selection
                    </button>
                  </div>
                  {bulkDeleteConfirmOpen ? (
                    <div
                      className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1"
                      data-testid="bases-bulk-delete-confirm"
                    >
                      <span>
                        Delete {selectedBaseIds.size} base(s)? This cannot
                        be undone.
                      </span>
                      <button
                        type="button"
                        className="rounded border border-destructive bg-destructive px-2 py-0.5 text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                        disabled={bulkDeleteMutation.isPending}
                        onClick={() =>
                          bulkDeleteMutation.mutate({
                            viewIds: Array.from(selectedBaseIds),
                          })
                        }
                        data-testid="bases-bulk-delete-confirm-button"
                      >
                        {bulkDeleteMutation.isPending
                          ? "Deleting…"
                          : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 hover:bg-muted"
                        onClick={() => setBulkDeleteConfirmOpen(false)}
                        data-testid="bases-bulk-delete-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  {bulkDeleteResult !== null ? (
                    <div data-testid="bases-bulk-delete-result">
                      {bulkDeleteResult}
                    </div>
                  ) : null}
                  {bulkDeleteError !== null ? (
                    <div
                      className="text-destructive"
                      data-testid="bases-bulk-delete-error"
                    >
                      Bulk delete failed: {bulkDeleteError}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <table className="w-full text-xs" data-testid="bases-list">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 w-6">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={togglePageSelection}
                        data-testid="bases-row-select-all"
                        aria-label="Select all bases on this page"
                      />
                    </th>
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
                  const isSharePending =
                    shareMutation.isPending &&
                    shareMutation.variables?.id === b.id;
                  const isShared = b.visibility === "workspace_shared";
                  const nextShareVisibility: "personal" | "workspace_shared" =
                    isShared ? "personal" : "workspace_shared";
                  const isPreviewing = previewBaseId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr
                        className="border-t border-border"
                        data-testid={`bases-row-${b.id}`}
                      >
                        <td className="py-1 w-6">
                          <input
                            type="checkbox"
                            checked={selectedBaseIds.has(b.id)}
                            onChange={() => toggleBaseSelection(b.id)}
                            data-testid={`bases-row-select-${b.id}`}
                            aria-label={`Select base ${b.name}`}
                          />
                        </td>
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
                          <button
                            type="button"
                            disabled={isSharePending}
                            className="underline text-muted-foreground disabled:opacity-50"
                            data-testid={`bases-row-share-${b.id}`}
                            onClick={() =>
                              shareMutation.mutate({
                                id: b.id,
                                visibility: nextShareVisibility,
                              })
                            }
                          >
                            {isSharePending
                              ? "Updating…"
                              : isShared
                                ? "Make personal"
                                : "Share with workspace"}
                          </button>
                          <button
                            type="button"
                            className="underline text-muted-foreground"
                            data-testid={`bases-row-preview-${b.id}`}
                            onClick={() =>
                              setPreviewBaseId(isPreviewing ? null : b.id)
                            }
                          >
                            {isPreviewing ? "Hide preview" : "Use base"}
                          </button>
                        </td>
                      </tr>
                      {shareError !== null && shareErrorBaseId === b.id ? (
                        <tr data-testid={`bases-row-share-error-row-${b.id}`}>
                          <td
                            colSpan={7}
                            className="bg-destructive/10 px-3 py-2 text-xs"
                          >
                            <p
                              className="text-destructive"
                              data-testid={`bases-row-share-error-${b.id}`}
                            >
                              Share-flip failed: {shareError}
                            </p>
                          </td>
                        </tr>
                      ) : null}
                      {isExpanded ? (
                        <tr data-testid={`bases-row-detail-${b.id}`}>
                          <td colSpan={7} className="bg-muted/20 px-3 py-2 text-xs">
                            <BaseRowDetail
                              base={b}
                              filterEdit={{
                                isOpen: filterEditBaseId === b.id,
                                draft: filterEditDraft,
                                error: filterEditError,
                                isPending:
                                  filterEditMutation.isPending &&
                                  filterEditMutation.variables?.id === b.id,
                                onOpen: () =>
                                  openFilterEditor(
                                    b.id,
                                    JSON.stringify(
                                      b.filters ?? { version: 1, conditions: [] },
                                      null,
                                      2,
                                    ),
                                  ),
                                onChange: setFilterEditDraft,
                                onSave: () => {
                                  let parsed: unknown;
                                  try {
                                    parsed = JSON.parse(filterEditDraft);
                                  } catch (e) {
                                    setFilterEditError(
                                      `Invalid JSON: ${
                                        e instanceof Error
                                          ? e.message
                                          : String(e)
                                      }`,
                                    );
                                    return;
                                  }
                                  const validated =
                                    FilterDocumentSchema.safeParse(parsed);
                                  if (!validated.success) {
                                    setFilterEditError(
                                      `Schema validation failed: ${validated.error.errors
                                        .map((e) => e.message)
                                        .join("; ")}`,
                                    );
                                    return;
                                  }
                                  filterEditMutation.mutate({
                                    id: b.id,
                                    filters: validated.data,
                                  });
                                },
                                onCancel: closeFilterEditor,
                              }}
                              sortEdit={{
                                isOpen: sortEditBaseId === b.id,
                                draft: sortEditDraft,
                                error: sortEditError,
                                isPending:
                                  sortEditMutation.isPending &&
                                  sortEditMutation.variables?.id === b.id,
                                onOpen: () =>
                                  openSortEditor(
                                    b.id,
                                    JSON.stringify(b.sort ?? {}, null, 2),
                                  ),
                                onChange: setSortEditDraft,
                                onSave: () => {
                                  let parsed: unknown;
                                  try {
                                    parsed = JSON.parse(sortEditDraft);
                                  } catch (e) {
                                    setSortEditError(
                                      `Invalid JSON: ${
                                        e instanceof Error
                                          ? e.message
                                          : String(e)
                                      }`,
                                    );
                                    return;
                                  }
                                  // Server's Zod input expects
                                  // `Record<string, unknown>` — reject
                                  // arrays / null / primitives client-side
                                  // for a clearer error.
                                  if (
                                    parsed === null ||
                                    typeof parsed !== "object" ||
                                    Array.isArray(parsed)
                                  ) {
                                    setSortEditError(
                                      "Sort must be a JSON object (e.g. {\"field\":\"updatedAt\",\"order\":\"desc\"}).",
                                    );
                                    return;
                                  }
                                  sortEditMutation.mutate({
                                    id: b.id,
                                    sort: parsed as Record<string, unknown>,
                                  });
                                },
                                onCancel: closeSortEditor,
                              }}
                              columnsEdit={{
                                isOpen: columnsEditBaseId === b.id,
                                draft: columnsEditDraft,
                                error: columnsEditError,
                                isPending:
                                  columnsEditMutation.isPending &&
                                  columnsEditMutation.variables?.id === b.id,
                                onOpen: () =>
                                  openColumnsEditor(
                                    b.id,
                                    JSON.stringify(b.columns ?? [], null, 2),
                                  ),
                                onChange: setColumnsEditDraft,
                                onSave: () => {
                                  let parsed: unknown;
                                  try {
                                    parsed = JSON.parse(columnsEditDraft);
                                  } catch (e) {
                                    setColumnsEditError(
                                      `Invalid JSON: ${
                                        e instanceof Error
                                          ? e.message
                                          : String(e)
                                      }`,
                                    );
                                    return;
                                  }
                                  // Columns must be string[].
                                  if (
                                    !Array.isArray(parsed) ||
                                    !parsed.every((c) => typeof c === "string")
                                  ) {
                                    setColumnsEditError(
                                      "Columns must be a JSON array of strings (e.g. [\"title\",\"tags\",\"updatedAt\"]).",
                                    );
                                    return;
                                  }
                                  columnsEditMutation.mutate({
                                    id: b.id,
                                    columns: parsed as string[],
                                  });
                                },
                                onCancel: closeColumnsEditor,
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                      {isRenaming ? (
                        <tr data-testid={`bases-row-rename-row-${b.id}`}>
                          <td
                            colSpan={7}
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
                            colSpan={7}
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
                      {isPreviewing ? (
                        <tr data-testid={`bases-row-preview-row-${b.id}`}>
                          <td
                            colSpan={7}
                            className="bg-muted/20 px-3 py-2 text-xs"
                          >
                            <BasePreview
                              base={b}
                              folderId={previewFolderId}
                              unenforcedKeys={unenforcedFilterKeys}
                              docParsed={previewDoc !== null}
                              conditionCount={previewDoc?.conditions.length ?? 0}
                              previewQuery={previewQuery}
                              previewNotes={previewNotes}
                              totalMatchCount={previewTotalMatchCount}
                              truncatedByDisplay={previewTruncatedByDisplay}
                              truncatedByFetchCap={previewTruncatedByFetchCap}
                              openPreviewNoteId={openPreviewNoteId}
                              setOpenPreviewNoteId={setOpenPreviewNoteId}
                              openNoteQuery={openNoteQuery}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
              </table>
            </>
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
  filterEdit,
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
  /**
   * T-F.101 (T-F.2-filter-γ) filter-edit affordance. Wired from
   * the parent so the editor state survives BaseRowDetail
   * re-renders. When `isOpen` is true the Filters section
   * renders an editable textarea instead of the read-only JSON
   * preview; Save validates against FilterDocumentSchema before
   * round-tripping through updateSavedView.
   */
  readonly filterEdit: {
    readonly isOpen: boolean;
    readonly draft: string;
    readonly error: string | null;
    readonly isPending: boolean;
    readonly onOpen: () => void;
    readonly onChange: (value: string) => void;
    readonly onSave: () => void;
    readonly onCancel: () => void;
  };
  /**
   * T-F.105 (T-F.2-a.3-narrow): sort/columns inline editors.
   * Same prop shape as filterEdit so the inline-editor sub-render
   * stays mechanical. Each editor wires its own per-stage Save
   * validation in the parent.
   */
  readonly sortEdit: {
    readonly isOpen: boolean;
    readonly draft: string;
    readonly error: string | null;
    readonly isPending: boolean;
    readonly onOpen: () => void;
    readonly onChange: (value: string) => void;
    readonly onSave: () => void;
    readonly onCancel: () => void;
  };
  readonly columnsEdit: {
    readonly isOpen: boolean;
    readonly draft: string;
    readonly error: string | null;
    readonly isPending: boolean;
    readonly onOpen: () => void;
    readonly onChange: (value: string) => void;
    readonly onSave: () => void;
    readonly onCancel: () => void;
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
        <div className="flex items-center justify-between">
          <p className="font-medium">Filters</p>
          {!filterEdit.isOpen ? (
            <button
              type="button"
              className="underline text-muted-foreground"
              data-testid={`bases-row-detail-filters-edit-${base.id}`}
              onClick={filterEdit.onOpen}
            >
              Edit filters…
            </button>
          ) : null}
        </div>
        {filterEdit.isOpen ? (
          <div
            className="space-y-2"
            data-testid={`bases-row-detail-filters-editor-${base.id}`}
          >
            {/* T-F.119 (T-F.2-γ-polish α): rich-form condition summary.
                Parses the current draft and renders each condition as
                a chip with field / op / value; per-chip Remove rewrites
                the draft JSON. Operator sees structured view of what's
                enforced without parsing JSON mentally. Read-only display
                + Remove only — full add/edit per-condition form is
                deferred to β/γ follow-ups (kind picker + adaptive value
                inputs by field type). */}
            <FilterConditionsSummary
              baseId={base.id}
              draft={filterEdit.draft}
              disabled={filterEdit.isPending}
              onChange={filterEdit.onChange}
            />
            <label
              className="block text-muted-foreground"
              htmlFor={`bases-row-detail-filters-textarea-${base.id}`}
            >
              FilterDocument JSON (V1 schema; max 32 conditions):
            </label>
            <textarea
              id={`bases-row-detail-filters-textarea-${base.id}`}
              data-testid={`bases-row-detail-filters-textarea-${base.id}`}
              className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-[10px]"
              rows={10}
              value={filterEdit.draft}
              onChange={(e) => filterEdit.onChange(e.target.value)}
              disabled={filterEdit.isPending}
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filterEdit.isPending}
                className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-filters-save-${base.id}`}
                onClick={filterEdit.onSave}
              >
                {filterEdit.isPending ? "Saving…" : "Save filters"}
              </button>
              <button
                type="button"
                disabled={filterEdit.isPending}
                className="underline text-muted-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-filters-cancel-${base.id}`}
                onClick={filterEdit.onCancel}
              >
                Cancel
              </button>
            </div>
            {filterEdit.error ? (
              <p
                className="text-destructive"
                data-testid={`bases-row-detail-filters-error-${base.id}`}
              >
                {filterEdit.error}
              </p>
            ) : null}
          </div>
        ) : base.filters && Object.keys(base.filters).length > 0 ? (
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
        <div className="flex items-center justify-between">
          <p className="font-medium">Sort</p>
          {!sortEdit.isOpen ? (
            <button
              type="button"
              className="underline text-muted-foreground"
              data-testid={`bases-row-detail-sort-edit-${base.id}`}
              onClick={sortEdit.onOpen}
            >
              Edit sort…
            </button>
          ) : null}
        </div>
        {sortEdit.isOpen ? (
          <div
            className="space-y-2"
            data-testid={`bases-row-detail-sort-editor-${base.id}`}
          >
            <label
              className="block text-muted-foreground"
              htmlFor={`bases-row-detail-sort-textarea-${base.id}`}
            >
              Sort JSON object (e.g. {`{"field":"updatedAt","order":"desc"}`}):
            </label>
            <textarea
              id={`bases-row-detail-sort-textarea-${base.id}`}
              data-testid={`bases-row-detail-sort-textarea-${base.id}`}
              className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-[10px]"
              rows={5}
              value={sortEdit.draft}
              onChange={(e) => sortEdit.onChange(e.target.value)}
              disabled={sortEdit.isPending}
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={sortEdit.isPending}
                className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-sort-save-${base.id}`}
                onClick={sortEdit.onSave}
              >
                {sortEdit.isPending ? "Saving…" : "Save sort"}
              </button>
              <button
                type="button"
                disabled={sortEdit.isPending}
                className="underline text-muted-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-sort-cancel-${base.id}`}
                onClick={sortEdit.onCancel}
              >
                Cancel
              </button>
            </div>
            {sortEdit.error ? (
              <p
                className="text-destructive"
                data-testid={`bases-row-detail-sort-error-${base.id}`}
              >
                {sortEdit.error}
              </p>
            ) : null}
          </div>
        ) : base.sort && Object.keys(base.sort).length > 0 ? (
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
        <div className="flex items-center justify-between">
          <p className="font-medium">
            Columns ({base.columns?.length ?? 0})
          </p>
          {!columnsEdit.isOpen ? (
            <button
              type="button"
              className="underline text-muted-foreground"
              data-testid={`bases-row-detail-columns-edit-${base.id}`}
              onClick={columnsEdit.onOpen}
            >
              Edit columns…
            </button>
          ) : null}
        </div>
        {columnsEdit.isOpen ? (
          <div
            className="space-y-2"
            data-testid={`bases-row-detail-columns-editor-${base.id}`}
          >
            <label
              className="block text-muted-foreground"
              htmlFor={`bases-row-detail-columns-textarea-${base.id}`}
            >
              Columns JSON array of strings (e.g. {`["title","tags","updatedAt"]`}):
            </label>
            <textarea
              id={`bases-row-detail-columns-textarea-${base.id}`}
              data-testid={`bases-row-detail-columns-textarea-${base.id}`}
              className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-[10px]"
              rows={5}
              value={columnsEdit.draft}
              onChange={(e) => columnsEdit.onChange(e.target.value)}
              disabled={columnsEdit.isPending}
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={columnsEdit.isPending}
                className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-columns-save-${base.id}`}
                onClick={columnsEdit.onSave}
              >
                {columnsEdit.isPending ? "Saving…" : "Save columns"}
              </button>
              <button
                type="button"
                disabled={columnsEdit.isPending}
                className="underline text-muted-foreground disabled:opacity-50"
                data-testid={`bases-row-detail-columns-cancel-${base.id}`}
                onClick={columnsEdit.onCancel}
              >
                Cancel
              </button>
            </div>
            {columnsEdit.error ? (
              <p
                className="text-destructive"
                data-testid={`bases-row-detail-columns-error-${base.id}`}
              >
                {columnsEdit.error}
              </p>
            ) : null}
          </div>
        ) : base.columns && base.columns.length > 0 ? (
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

/**
 * T-F.119 (T-F.2-γ-polish α) FilterConditionsSummary — read-only
 * structured visualization of the conditions currently encoded in
 * the filter-edit draft JSON. Each condition renders as a chip
 * naming field / op / value; a per-chip Remove button rewrites the
 * draft JSON (drops that condition; re-serializes the rest with
 * stable 2-space indent matching the textarea's existing format).
 *
 * Unparseable / non-V1 drafts fall back to a "structured view
 * unavailable — edit the JSON directly" hint so the operator
 * always has an editing path. The textarea remains the primary
 * (and currently only) ADD surface; add/edit-per-condition forms
 * are deferred to β/γ follow-ups.
 */
function FilterConditionsSummary({
  baseId,
  draft,
  disabled,
  onChange,
}: {
  baseId: number;
  draft: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  // ── T-F.120 (T-F.2-γ-polish β): add-condition inline form ──
  // The form is mounted at the panel level (not per-row) since
  // only one summary is visible at a time (one row is in
  // filter-edit mode). Single composite state slice for the form;
  // draftValue is a string regardless of target field type (typed
  // parsing happens at Add-time).
  const [addField, setAddField] = useState<
    "" | "folderId" | "slug" | "title" | "governanceStatus" | "updatedAt"
  >("");
  const [addOp, setAddOp] = useState<"gte" | "lte">("gte");
  const [addValue, setAddValue] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);

  // ── T-F.121 (T-F.2-γ-polish γ): edit-existing-condition ──
  // Per-chip Edit button opens an inline editor pre-populated with
  // the current condition values. Save calls buildConditionFromForm
  // (shared with Add) but REPLACES the condition at editingIdx
  // instead of appending. Cancel exits without changes. Mutually
  // exclusive with the Add form via shared form-state slices —
  // opening Edit pre-fills + sets editingIdx; opening Add (or
  // submitting either) clears editingIdx.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Parse defensively — operator may be mid-edit with invalid JSON.
  let parsed: FilterDocument | null = null;
  try {
    parsed = parseFilterDocument(JSON.parse(draft));
  } catch {
    parsed = null;
  }

  if (parsed === null) {
    // Unparseable: skip the rich summary (and the add-condition
    // form which depends on it) — operator must fix the JSON first.
    return (
      <div
        className="rounded border border-border bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground"
        data-testid={`bases-row-detail-filters-summary-unavailable-${baseId}`}
      >
        Structured view unavailable — current draft does not parse as
        a V1 filter document. Edit the JSON below directly.
      </div>
    );
  }

  function describeCondition(c: FilterCondition): string {
    switch (c.field) {
      case "folderId":
        return `folderId = ${c.value}`;
      case "slug":
        return `slug = "${c.value}"`;
      case "title":
        return `title contains "${c.value}"`;
      case "governanceStatus":
        return `governanceStatus in [${c.value.map((v) => `"${v}"`).join(", ")}]`;
      case "updatedAt":
        return `updatedAt ${c.op} ${c.value}`;
    }
  }

  function removeConditionAt(idx: number): void {
    if (parsed === null) return;
    const next: FilterDocument = {
      version: 1,
      conditions: parsed.conditions.filter((_, i) => i !== idx),
    };
    onChange(JSON.stringify(next, null, 2));
  }

  // T-F.120 (T-F.2-γ-polish β): build a typed FilterCondition from
  // the form state. Returns the condition on success, null on
  // validation failure (caller sets addError to operator-friendly
  // explanation). The Zod schema would reject everything that
  // wouldn't parse, but inline messages are friendlier than
  // "Schema validation failed" — so we validate here first.
  function buildConditionFromForm(): FilterCondition | null {
    setAddError(null);
    const trimmed = addValue.trim();
    if (trimmed === "" && addField !== "") {
      setAddError("Value required.");
      return null;
    }
    switch (addField) {
      case "":
        setAddError("Pick a field.");
        return null;
      case "folderId": {
        const n = Number(trimmed);
        if (!Number.isInteger(n) || n <= 0) {
          setAddError("folderId must be a positive integer.");
          return null;
        }
        return { field: "folderId", op: "eq", value: n };
      }
      case "slug":
        return { field: "slug", op: "eq", value: trimmed };
      case "title":
        return { field: "title", op: "contains", value: trimmed };
      case "governanceStatus": {
        const values = trimmed
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (values.length === 0) {
          setAddError(
            "governanceStatus requires at least one comma-separated value.",
          );
          return null;
        }
        return { field: "governanceStatus", op: "in", value: values };
      }
      case "updatedAt":
        if (Number.isNaN(Date.parse(trimmed))) {
          setAddError("updatedAt requires a valid ISO-8601 timestamp.");
          return null;
        }
        return { field: "updatedAt", op: addOp, value: trimmed };
    }
  }

  function addCondition(): void {
    if (parsed === null) {
      setAddError("Current draft does not parse — fix the JSON first.");
      return;
    }
    if (parsed.conditions.length >= 32) {
      setAddError("Max 32 conditions.");
      return;
    }
    const c = buildConditionFromForm();
    if (c === null) return;
    const next: FilterDocument = {
      version: 1,
      conditions: [...parsed.conditions, c],
    };
    onChange(JSON.stringify(next, null, 2));
    resetForm();
  }

  // T-F.121 (T-F.2-γ-polish γ): edit-existing-condition helpers.
  function openEditCondition(idx: number, c: FilterCondition): void {
    setEditingIdx(idx);
    setAddField(c.field);
    setAddError(null);
    // Project the typed condition value back to the form's string
    // shape (mirror of buildConditionFromForm's typed-output).
    switch (c.field) {
      case "folderId":
        setAddValue(String(c.value));
        setAddOp("gte");
        break;
      case "slug":
      case "title":
        setAddValue(c.value);
        setAddOp("gte");
        break;
      case "governanceStatus":
        setAddValue(c.value.join(", "));
        setAddOp("gte");
        break;
      case "updatedAt":
        setAddValue(c.value);
        setAddOp(c.op);
        break;
    }
  }
  function cancelEditCondition(): void {
    resetForm();
  }
  function saveEditCondition(): void {
    if (parsed === null) {
      setAddError("Current draft does not parse — fix the JSON first.");
      return;
    }
    if (editingIdx === null) return;
    const c = buildConditionFromForm();
    if (c === null) return;
    const next: FilterDocument = {
      version: 1,
      conditions: parsed.conditions.map((existing, i) =>
        i === editingIdx ? c : existing,
      ),
    };
    onChange(JSON.stringify(next, null, 2));
    resetForm();
  }
  function resetForm(): void {
    setAddField("");
    setAddValue("");
    setAddOp("gte");
    setAddError(null);
    setEditingIdx(null);
    setAddValueChipDraft("");
  }

  // T-F.124 (T-F.2-γ-polish ζ): governanceStatus chip helpers.
  // addValue stays canonical comma-separated string (what
  // buildConditionFromForm consumes) — the chip UI is a
  // presentational layer that splits on read and joins on write.
  // A separate `addValueChipDraft` slice holds the partially-typed
  // chip the operator hasn't committed yet (Enter or comma).
  const [addValueChipDraft, setAddValueChipDraft] = useState<string>("");
  function parseChipList(csv: string): string[] {
    return csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  function chipListToCsv(chips: readonly string[]): string {
    return chips.join(", ");
  }
  function commitChipDraft(): void {
    if (addField !== "governanceStatus") return;
    const newChips = parseChipList(addValueChipDraft);
    if (newChips.length === 0) return;
    const existing = parseChipList(addValue);
    const next = [...existing];
    for (const c of newChips) {
      if (!next.includes(c)) next.push(c);
    }
    setAddValue(chipListToCsv(next));
    setAddValueChipDraft("");
  }
  function removeChipAt(idx: number): void {
    const chips = parseChipList(addValue);
    setAddValue(chipListToCsv(chips.filter((_, i) => i !== idx)));
  }

  // T-F.123 (T-F.2-γ-polish ε): datetime-local <-> ISO conversion
  // helpers for the updatedAt input. addValue stays canonical
  // ISO-8601 internally (what buildConditionFromForm consumes and
  // openEditCondition pre-fills with); the input value is the
  // local-time "YYYY-MM-DDTHH:mm" string the browser's
  // datetime-local control wants.
  //
  // Returns empty string on invalid input so the operator can clear
  // the field. The Zod schema's `.datetime()` rejection at submit-
  // time handles other malformed cases.
  function isoToLocalInputValue(iso: string): string {
    if (iso === "") return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function localInputValueToIso(local: string): string {
    if (local === "") return "";
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
  }

  return (
    <div
      className="space-y-1 rounded border border-border bg-muted/20 px-2 py-1"
      data-testid={`bases-row-detail-filters-summary-${baseId}`}
    >
      {parsed.conditions.length === 0 ? (
        <div
          className="text-[10px] text-muted-foreground"
          data-testid={`bases-row-detail-filters-summary-empty-${baseId}`}
        >
          No conditions — base matches all notes.
        </div>
      ) : (
        <>
          <div className="text-[10px] text-muted-foreground">
            Parsed conditions ({parsed.conditions.length}):
          </div>
          <ul className="space-y-0.5">
            {parsed.conditions.map((c, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 text-[10px]"
                data-testid={`bases-row-detail-filters-summary-row-${baseId}-${idx}`}
              >
                <span className="font-mono">{describeCondition(c)}</span>
                <button
                  type="button"
                  className="ml-auto underline text-muted-foreground disabled:opacity-50"
                  disabled={disabled || editingIdx !== null}
                  onClick={() => openEditCondition(idx, c)}
                  data-testid={`bases-row-detail-filters-summary-edit-${baseId}-${idx}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="underline text-muted-foreground disabled:opacity-50"
                  disabled={disabled || editingIdx !== null}
                  onClick={() => removeConditionAt(idx)}
                  data-testid={`bases-row-detail-filters-summary-remove-${baseId}-${idx}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* T-F.120 (T-F.2-γ-polish β): add-condition inline form. */}
      <div
        className="mt-1 flex flex-wrap items-center gap-1 border-t border-border pt-1 text-[10px]"
        data-testid={`bases-row-detail-filters-add-${baseId}`}
      >
        <select
          className="rounded border border-border bg-background px-1 py-0.5"
          value={addField}
          onChange={(e) =>
            setAddField(e.target.value as typeof addField)
          }
          // T-F.121: lock the field picker while editing — changing
          // the field type mid-edit would corrupt the slot.
          disabled={disabled || editingIdx !== null}
          data-testid={`bases-row-detail-filters-add-field-${baseId}`}
        >
          <option value="">
            {editingIdx !== null
              ? `Editing condition #${editingIdx + 1}`
              : "+ Add condition…"}
          </option>
          <option value="folderId">folderId</option>
          <option value="slug">slug</option>
          <option value="title">title</option>
          <option value="governanceStatus">governanceStatus</option>
          <option value="updatedAt">updatedAt</option>
        </select>
        {addField === "updatedAt" ? (
          <select
            className="rounded border border-border bg-background px-1 py-0.5"
            value={addOp}
            onChange={(e) => setAddOp(e.target.value as "gte" | "lte")}
            disabled={disabled}
            data-testid={`bases-row-detail-filters-add-op-${baseId}`}
          >
            <option value="gte">gte</option>
            <option value="lte">lte</option>
          </select>
        ) : null}
        {addField !== "" ? (
          <>
            {/* T-F.122 (T-F.2-γ-polish δ): type-aware folderId input.
                Number input gives mobile number-pad + browser-level
                non-numeric rejection before buildConditionFromForm
                runs. min=1 + step=1 match the FolderIdEqSchema
                contract (`z.number().int().positive()`).
                T-F.123 (T-F.2-γ-polish ε): type-aware updatedAt
                datetime-local input. addValue stays canonical ISO
                internally; the input value is the local-time
                "YYYY-MM-DDTHH:mm" string the browser wants —
                converted via the helpers above.
                T-F.124 (T-F.2-γ-polish ζ): governanceStatus multi-
                token chips. addValue stays canonical comma-
                separated string; chip UI is a presentational layer
                that splits on read and joins on write. Separate
                `addValueChipDraft` slice for the currently-typed
                chip. Enter / comma commits; × removes. */}
            {addField === "governanceStatus" ? (
              <div
                className="flex flex-wrap items-center gap-1"
                data-testid={`bases-row-detail-filters-add-chips-${baseId}`}
              >
                {parseChipList(addValue).map((chip, idx) => (
                  <span
                    key={`${chip}-${idx}`}
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1 py-0.5 font-mono"
                    data-testid={`bases-row-detail-filters-add-chip-${baseId}-${idx}`}
                  >
                    {chip}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => removeChipAt(idx)}
                      data-testid={`bases-row-detail-filters-add-chip-remove-${baseId}-${idx}`}
                      aria-label={`Remove ${chip}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  className="rounded border border-border bg-background px-1 py-0.5 font-mono"
                  value={addValueChipDraft}
                  onChange={(e) => setAddValueChipDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitChipDraft();
                    }
                  }}
                  onBlur={commitChipDraft}
                  placeholder="add a status…"
                  disabled={disabled}
                  data-testid={`bases-row-detail-filters-add-chip-input-${baseId}`}
                />
              </div>
            ) : (
              <input
                type={
                  addField === "folderId"
                    ? "number"
                    : addField === "updatedAt"
                      ? "datetime-local"
                      : "text"
                }
                min={addField === "folderId" ? 1 : undefined}
                step={addField === "folderId" ? 1 : undefined}
                className="rounded border border-border bg-background px-1 py-0.5 font-mono"
                value={
                  addField === "updatedAt"
                    ? isoToLocalInputValue(addValue)
                    : addValue
                }
                onChange={(e) =>
                  setAddValue(
                    addField === "updatedAt"
                      ? localInputValueToIso(e.target.value)
                      : e.target.value,
                  )
                }
                placeholder={
                  addField === "folderId"
                    ? "positive integer"
                    : addField === "updatedAt"
                      ? "ISO-8601 (e.g. 2026-01-01T00:00:00Z)"
                      : addField === "title"
                        ? "substring"
                        : "exact match"
                }
                disabled={disabled}
                data-testid={`bases-row-detail-filters-add-value-${baseId}`}
              />
            )}
            {editingIdx === null ? (
              <button
                type="button"
                className="rounded border border-border bg-background px-2 py-0.5 hover:bg-muted disabled:opacity-50"
                onClick={addCondition}
                disabled={disabled}
                data-testid={`bases-row-detail-filters-add-submit-${baseId}`}
              >
                Add
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded border border-border bg-background px-2 py-0.5 hover:bg-muted disabled:opacity-50"
                  onClick={saveEditCondition}
                  disabled={disabled}
                  data-testid={`bases-row-detail-filters-edit-save-${baseId}`}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="underline text-muted-foreground disabled:opacity-50"
                  onClick={cancelEditCondition}
                  disabled={disabled}
                  data-testid={`bases-row-detail-filters-edit-cancel-${baseId}`}
                >
                  Cancel
                </button>
              </>
            )}
          </>
        ) : null}
        {addError !== null ? (
          <span
            className="ml-1 text-destructive"
            data-testid={`bases-row-detail-filters-add-error-${baseId}`}
          >
            {addError}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * T-F.98 (T-F.2-ζ) BasePreview — first "use the base" operator
 * path. Calls `vault.listNotes` with the base's `filters.folderId`
 * (the one filter the server understands today) and renders the
 * matching notes table.
 *
 * Honest about the filter-language gap: a banner above the table
 * names which JSON keys in `filters` are vs aren't enforced. When
 * the base has `folderId` set, the preview narrows to that folder;
 * other keys (tag, title-substring, etc.) are listed as "not yet
 * enforced — preview shows all matches for the enforced keys only".
 *
 * Renders a 5-column notes table (id / title / slug / governance /
 * updated) capped at PREVIEW_LIMIT=25 rows.
 */
function BasePreview({
  base,
  folderId,
  unenforcedKeys,
  docParsed,
  conditionCount,
  previewQuery,
  previewNotes,
  totalMatchCount,
  truncatedByDisplay,
  truncatedByFetchCap,
}: {
  readonly base: { readonly id: number; readonly name: string };
  readonly folderId: number | undefined;
  readonly unenforcedKeys: readonly string[];
  /**
   * T-F.102 (T-F.2-filter-δ): `true` when the previewing base's
   * `filters` JSON parses against the V1 FilterDocumentSchema (or
   * the legacy `{ folderId }` shape). When `true`, ALL V1
   * conditions are enforced client-side via `applyFilterDocument`,
   * so `unenforcedKeys` is empty and the banner copy reflects
   * "applying V1 filter document" rather than "only folderId
   * enforced".
   */
  readonly docParsed: boolean;
  /** Number of conditions in the parsed V1 doc (0 when un-parsed). */
  readonly conditionCount: number;
  readonly previewQuery: ReturnType<
    typeof trpc.agentStudio.vault.listNotes.useQuery
  >;
  /**
   * T-F.102 (T-F.2-filter-δ): client-side-narrowed result.
   * Distinct from `previewQuery.data` (which is the over-sample
   * fetch BEFORE narrowing). The notes table renders from this
   * post-narrow list, capped at PREVIEW_LIMIT.
   */
  readonly previewNotes: ReadonlyArray<{
    readonly id: number;
    readonly slug: string;
    readonly title: string;
    readonly governanceStatus: string;
    readonly updatedAt: string | Date;
  }>;
  /**
   * T-F.103 (a.1-narrow): row-count metadata. `totalMatchCount` is
   * matches in the fetched sample (post-narrow but pre-display
   * slice). `truncatedByDisplay` is true when totalMatchCount >
   * PREVIEW_LIMIT (display cap hit). `truncatedByFetchCap` is true
   * when the server-side over-sample maxed out — matches beyond the
   * first PREVIEW_FETCH_OVER_SAMPLE vault rows may be missed.
   */
  readonly totalMatchCount: number;
  readonly truncatedByDisplay: boolean;
  readonly truncatedByFetchCap: boolean;
  /**
   * T-F.104 (T-F.2-a.2-narrow): drill-into-note state. Single id
   * (one note open at a time). `setOpenPreviewNoteId(null)` to
   * collapse. The `openNoteQuery` is gated by the parent on
   * `openPreviewNoteId !== null`.
   */
  readonly openPreviewNoteId: number | null;
  readonly setOpenPreviewNoteId: (id: number | null) => void;
  readonly openNoteQuery: ReturnType<
    typeof trpc.agentStudio.vault.getNote.useQuery
  >;
}) {
  return (
    <div
      className="space-y-3"
      data-testid={`bases-row-preview-body-${base.id}`}
    >
      <div data-testid={`bases-row-preview-banner-${base.id}`}>
        <p className="font-medium">
          Preview: applying base{" "}
          <span className="font-mono">{base.name}</span>
        </p>
        <ul className="ml-3 list-disc text-muted-foreground">
          {docParsed ? (
            <li data-testid={`bases-row-preview-doc-parsed-${base.id}`}>
              V1 filter document: {conditionCount} condition
              {conditionCount === 1 ? "" : "s"} (all enforced — folder
              narrowing server-side, remaining conditions narrowed
              client-side after the {`${"vault.listNotes"}`} fetch).
            </li>
          ) : (
            <li data-testid={`bases-row-preview-doc-unparsed-${base.id}`}>
              Filters could NOT be parsed against the V1 schema —
              preview falls back to legacy folderId-only narrowing.
              Edit the base&apos;s filters to a V1 document for
              full enforcement.
            </li>
          )}
          <li>
            folderId:{" "}
            {folderId !== undefined ? (
              <span
                className="font-mono"
                data-testid={`bases-row-preview-folder-id-${base.id}`}
              >
                {folderId} (enforced)
              </span>
            ) : (
              <span
                className="font-mono italic"
                data-testid={`bases-row-preview-folder-id-empty-${base.id}`}
              >
                (not set — preview shows all notes in vault)
              </span>
            )}
          </li>
          {unenforcedKeys.length > 0 ? (
            <li
              data-testid={`bases-row-preview-unenforced-${base.id}`}
            >
              Other filter keys (
              <span className="font-mono">
                {unenforcedKeys.join(", ")}
              </span>
              ) — not yet enforced; preview shows matches for the
              enforced keys only.
            </li>
          ) : null}
          <li data-testid={`bases-row-preview-match-count-${base.id}`}>
            Matches: <span className="font-mono">{totalMatchCount}</span>
            {truncatedByDisplay ? (
              <>
                {" "}
                <span
                  className="text-muted-foreground"
                  data-testid={`bases-row-preview-truncated-display-${base.id}`}
                >
                  (showing first {previewNotes.length} after narrowing;
                  remaining rows omitted for display).
                </span>
              </>
            ) : null}
            {truncatedByFetchCap ? (
              <>
                {" "}
                <span
                  className="text-destructive"
                  data-testid={`bases-row-preview-truncated-fetch-${base.id}`}
                >
                  (fetch over-sample at server cap — matches beyond the
                  first {200} vault rows may be missed. Narrow filters
                  or visit the vault list page directly.)
                </span>
              </>
            ) : null}
          </li>
        </ul>
      </div>
      <div>
        <p className="font-medium">
          Matching notes (first {25}, newest first)
        </p>
        {previewQuery.isLoading ? (
          <p
            className="text-muted-foreground italic"
            data-testid={`bases-row-preview-loading-${base.id}`}
          >
            Loading notes…
          </p>
        ) : previewQuery.error ? (
          <p
            className="text-destructive"
            data-testid={`bases-row-preview-error-${base.id}`}
          >
            Failed to load preview: {previewQuery.error.message}
          </p>
        ) : previewNotes.length === 0 ? (
          <p
            className="text-muted-foreground italic"
            data-testid={`bases-row-preview-empty-${base.id}`}
          >
            No matching notes — the base&apos;s filters narrow to an
            empty result set in this vault.
          </p>
        ) : (
          <table
            className="w-full text-xs"
            data-testid={`bases-row-preview-notes-${base.id}`}
          >
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">id</th>
                <th className="py-1">title</th>
                <th className="py-1">slug</th>
                <th className="py-1">governance</th>
                <th className="py-1">updated</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {previewNotes.map((n) => {
                const isOpen = openPreviewNoteId === n.id;
                return (
                  <Fragment key={n.id}>
                    <tr
                      className="border-t border-border"
                      data-testid={`bases-row-preview-note-${base.id}-${n.id}`}
                    >
                      <td className="py-1 font-mono">{n.id}</td>
                      <td className="py-1">{n.title}</td>
                      <td className="py-1 font-mono text-muted-foreground">
                        {n.slug}
                      </td>
                      <td className="py-1 font-mono text-muted-foreground">
                        {n.governanceStatus}
                      </td>
                      <td className="py-1 font-mono text-muted-foreground">
                        {new Date(n.updatedAt).toISOString()}
                      </td>
                      <td className="py-1">
                        <button
                          type="button"
                          className="underline text-muted-foreground"
                          data-testid={`bases-row-preview-note-open-${base.id}-${n.id}`}
                          onClick={() =>
                            setOpenPreviewNoteId(isOpen ? null : n.id)
                          }
                        >
                          {isOpen ? "Close" : "Open"}
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr
                        data-testid={`bases-row-preview-note-content-row-${base.id}-${n.id}`}
                      >
                        <td
                          colSpan={6}
                          className="bg-background/50 px-3 py-2 text-[10px]"
                        >
                          <NoteContentInline
                            baseId={base.id}
                            noteId={n.id}
                            noteQuery={openNoteQuery}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * T-F.104 (T-F.2-a.2-narrow) NoteContentInline — drill-into-note
 * content panel rendered inside the ζ-preview row. Consumes the
 * parent-gated `vault.getNote` query (returns `{ note, latestVersion }`)
 * and renders the markdown source as plain text in a scrollable
 * <pre>. Loading / error / empty states all testid-tagged. Markdown
 * rendering (paragraph-formatted text, syntax-highlighted code
 * blocks) is deferred — operators can read the raw markdown as a
 * confidence check; the full rendered view is the vault note page
 * (out of scope for the within-Bases NARROW arc).
 */
function NoteContentInline({
  baseId,
  noteId,
  noteQuery,
}: {
  readonly baseId: number;
  readonly noteId: number;
  readonly noteQuery: ReturnType<
    typeof trpc.agentStudio.vault.getNote.useQuery
  >;
}) {
  if (noteQuery.isLoading) {
    return (
      <p
        className="text-muted-foreground italic"
        data-testid={`bases-row-preview-note-content-loading-${baseId}-${noteId}`}
      >
        Loading note content…
      </p>
    );
  }
  if (noteQuery.error) {
    return (
      <p
        className="text-destructive"
        data-testid={`bases-row-preview-note-content-error-${baseId}-${noteId}`}
      >
        Failed to load note: {noteQuery.error.message}
      </p>
    );
  }
  if (!noteQuery.data) {
    return (
      <p
        className="text-muted-foreground italic"
        data-testid={`bases-row-preview-note-content-unavailable-${baseId}-${noteId}`}
      >
        Note content unavailable.
      </p>
    );
  }
  const { note, latestVersion } = noteQuery.data;
  if (!latestVersion) {
    return (
      <p
        className="text-muted-foreground italic"
        data-testid={`bases-row-preview-note-content-no-version-${baseId}-${noteId}`}
      >
        Note has no versions yet — content is empty.
      </p>
    );
  }
  return (
    <div
      className="space-y-2"
      data-testid={`bases-row-preview-note-content-${baseId}-${noteId}`}
    >
      <p
        className="text-muted-foreground"
        data-testid={`bases-row-preview-note-content-meta-${baseId}-${noteId}`}
      >
        v{latestVersion.version} · {new Date(latestVersion.createdAt).toISOString()}
        {latestVersion.authorUserId !== null ? (
          <> · author user#{latestVersion.authorUserId}</>
        ) : null}
        {" · "}
        <span className="font-mono">{note.governanceStatus}</span>
      </p>
      <pre
        className="max-h-64 overflow-auto rounded bg-background/70 p-2 font-mono text-[10px] whitespace-pre-wrap"
        data-testid={`bases-row-preview-note-content-md-${baseId}-${noteId}`}
      >
        {latestVersion.contentMd}
      </pre>
    </div>
  );
}
