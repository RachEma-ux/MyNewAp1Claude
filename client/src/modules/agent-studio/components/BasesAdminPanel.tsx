// BasesAdminPanel — no-deferral continuation-21 slice 96.
//
// Canonical-CRUD operator surface for the Phase 24 MVP bases data
// model (`ags_bases` / `ags_base_columns` / `ags_base_rows`). Closes
// the 10-endpoint `bases.*` UI-consumer gap (create / list /
// getSnapshot / update / createColumn / listColumns / createRow /
// updateRow / listRows / deleteRow).
//
// Coexists with the existing T-F.91 / T-F.2-α `BasesPanel` (saved-
// view α-shell with filter-language UX). This panel uses the
// canonical CRUD; the α-shell remains until a separate sub-arc
// deprecates it. See continuation-21 catalogue in
// docs/implementation/agent-studio-no-deferral-todo-2026-05-19.md
// for the coexistence rationale.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side `AGS_BASE_COLUMN_DATA_TYPES` 7-value enum.
const COLUMN_DATA_TYPES = [
  "text",
  "number",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "note_link",
] as const;
type ColumnDataType = (typeof COLUMN_DATA_TYPES)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseJsonRecord(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  if (trimmed === "") return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function BasesAdminPanel() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState<number | null>(null);

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedVault = parsePositiveInt(vaultId);

  const listInput = {
    ...(parsedWorkspace !== null ? { workspaceId: parsedWorkspace } : {}),
    ...(parsedVault !== null ? { vaultId: parsedVault } : {}),
    ...(includeArchived ? { includeArchived: true } : {}),
  };

  return (
    <div className="space-y-4" data-testid="bases-admin-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Scope</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ba-ws-id">Workspace id (optional)</Label>
              <Input
                id="ba-ws-id"
                data-testid="ba-workspace-id"
                type="number"
                min={1}
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder="all-visible"
              />
            </div>
            <div>
              <Label htmlFor="ba-vault-id">Vault id (optional)</Label>
              <Input
                id="ba-vault-id"
                data-testid="ba-vault-id"
                type="number"
                min={1}
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
                placeholder="all"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="ba-include-archived"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                />
                Include archived
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <BasesListSection
        listInput={listInput}
        selectedBaseId={selectedBaseId}
        onSelectBase={setSelectedBaseId}
      />

      {selectedBaseId !== null ? (
        <BaseDetailSection baseId={selectedBaseId} />
      ) : (
        <Card>
          <CardContent className="p-4">
            <p
              className="text-sm text-muted-foreground"
              data-testid="ba-detail-empty"
            >
              Select a base from the list to view columns and rows.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface BasesListSectionProps {
  readonly listInput: {
    workspaceId?: number;
    vaultId?: number;
    includeArchived?: boolean;
  };
  readonly selectedBaseId: number | null;
  readonly onSelectBase: (id: number | null) => void;
}

function BasesListSection({
  listInput,
  selectedBaseId,
  onSelectBase,
}: BasesListSectionProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("");

  const utils = trpc.useUtils();
  const listQuery = trpc.agentStudio.bases.list.useQuery(listInput, {
    refetchOnWindowFocus: false,
  });

  const createMut = trpc.agentStudio.bases.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Base ${res.id} created`);
      setName("");
      setSlug("");
      setDescription("");
      setIcon("");
      setColor("");
      void utils.agentStudio.bases.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Create failed: ${err.message ?? "unknown"}`);
    },
  });

  const updateMut = trpc.agentStudio.bases.update.useMutation({
    onSuccess: () => {
      toast.success("Base updated");
      void utils.agentStudio.bases.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Update failed: ${err.message ?? "unknown"}`);
    },
  });

  const slugValid =
    slug.trim().length > 0 && /^[a-z0-9][a-z0-9-]*$/i.test(slug.trim());
  const colorValid = color.trim() === "" || /^#[0-9a-fA-F]{6}$/.test(color);
  const formValid = name.trim().length > 0 && slugValid && colorValid;

  function handleCreate() {
    if (!formValid) return;
    createMut.mutate({
      ...(listInput.workspaceId !== undefined
        ? { workspaceId: listInput.workspaceId }
        : {}),
      ...(listInput.vaultId !== undefined ? { vaultId: listInput.vaultId } : {}),
      name: name.trim(),
      slug: slug.trim(),
      ...(description.trim() !== "" ? { description: description.trim() } : {}),
      ...(icon.trim() !== "" ? { icon: icon.trim() } : {}),
      ...(color.trim() !== "" ? { color: color.trim() } : {}),
    });
  }

  function handleToggleArchive(baseId: number, archived: boolean) {
    updateMut.mutate({ baseId, archived: !archived });
  }

  const bases = listQuery.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Bases list</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create base</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ba-create-name">Name</Label>
              <Input
                id="ba-create-name"
                data-testid="ba-create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Research backlog"
                maxLength={255}
              />
            </div>
            <div>
              <Label htmlFor="ba-create-slug">Slug</Label>
              <Input
                id="ba-create-slug"
                data-testid="ba-create-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="research-backlog"
                maxLength={255}
              />
              {slug !== "" && !slugValid ? (
                <p
                  className="mt-1 text-xs text-destructive"
                  data-testid="ba-create-slug-error"
                >
                  Slug must match [a-z0-9][a-z0-9-]*
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ba-create-desc">Description (optional)</Label>
              <Input
                id="ba-create-desc"
                data-testid="ba-create-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="ba-create-icon">Icon (optional)</Label>
                <Input
                  id="ba-create-icon"
                  data-testid="ba-create-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="📚"
                  maxLength={64}
                />
              </div>
              <div>
                <Label htmlFor="ba-create-color">Color #RRGGBB</Label>
                <Input
                  id="ba-create-color"
                  data-testid="ba-create-color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#3b82f6"
                />
                {color !== "" && !colorValid ? (
                  <p
                    className="mt-1 text-xs text-destructive"
                    data-testid="ba-create-color-error"
                  >
                    Must be #RRGGBB
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            type="button"
            disabled={!formValid || createMut.isPending}
            onClick={handleCreate}
            data-testid="ba-create-button"
          >
            {createMut.isPending ? "Creating…" : "Create base"}
          </Button>
        </div>

        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading bases…</p>
        ) : listQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="ba-list-error"
          >
            List failed: {listQuery.error.message}
          </p>
        ) : bases.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="ba-list-empty"
          >
            No bases match this scope.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="ba-list">
            {bases.map((b) => {
              const isSelected = b.id === selectedBaseId;
              const isArchived = b.archivedAt != null;
              return (
                <li
                  key={b.id}
                  data-testid="ba-list-row"
                  className={
                    "flex items-center justify-between gap-2 rounded border p-2 text-sm " +
                    (isSelected
                      ? "border-primary bg-primary/10"
                      : "bg-background")
                  }
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectBase(b.id)}
                    data-testid="ba-list-row-select"
                  >
                    {b.icon ? <span>{b.icon}</span> : null}
                    <span className="font-medium">{b.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.slug}
                    </span>
                    {isArchived ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        archived
                      </span>
                    ) : null}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={updateMut.isPending}
                    onClick={() => handleToggleArchive(b.id, isArchived)}
                    data-testid="ba-list-row-archive"
                  >
                    {isArchived ? "Restore" : "Archive"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface BaseDetailSectionProps {
  readonly baseId: number;
}

function BaseDetailSection({ baseId }: BaseDetailSectionProps) {
  const utils = trpc.useUtils();
  const snapshotQuery = trpc.agentStudio.bases.getSnapshot.useQuery(
    { baseId },
    { refetchOnWindowFocus: false },
  );

  if (snapshotQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Loading snapshot…</p>
        </CardContent>
      </Card>
    );
  }
  if (snapshotQuery.error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p
            className="text-sm text-destructive"
            data-testid="ba-snapshot-error"
          >
            Snapshot failed: {snapshotQuery.error.message}
          </p>
        </CardContent>
      </Card>
    );
  }
  const snap = snapshotQuery.data;
  if (!snap) return null;

  return (
    <div className="space-y-4" data-testid="ba-detail">
      <Card>
        <CardContent className="space-y-2 p-4">
          <SectionLabel>Base #{snap.base.id} — {snap.base.name}</SectionLabel>
          <p className="font-mono text-xs text-muted-foreground">
            slug: {snap.base.slug} · {snap.columns.length} column
            {snap.columns.length === 1 ? "" : "s"} · {snap.rows.length} row
            {snap.rows.length === 1 ? "" : "s"}
          </p>
          {snap.base.description ? (
            <p className="text-sm">{snap.base.description}</p>
          ) : null}
        </CardContent>
      </Card>

      <ColumnsSubsection
        baseId={baseId}
        columns={snap.columns}
        onMutate={() => {
          void utils.agentStudio.bases.getSnapshot.invalidate({ baseId });
        }}
      />

      <RowsSubsection
        baseId={baseId}
        columns={snap.columns}
        rows={snap.rows}
        onMutate={() => {
          void utils.agentStudio.bases.getSnapshot.invalidate({ baseId });
        }}
      />
    </div>
  );
}

interface ColumnLike {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly dataType: string;
}

interface ColumnsSubsectionProps {
  readonly baseId: number;
  readonly columns: ReadonlyArray<ColumnLike>;
  readonly onMutate: () => void;
}

function ColumnsSubsection({
  baseId,
  columns,
  onMutate,
}: ColumnsSubsectionProps) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<ColumnDataType>("text");
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editColumnName, setEditColumnName] = useState("");

  const createColMut = trpc.agentStudio.bases.createColumn.useMutation({
    onSuccess: () => {
      toast.success("Column created");
      setKey("");
      setName("");
      setDataType("text");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Create column failed: ${err.message ?? "unknown"}`);
    },
  });

  const updateColMut = trpc.agentStudio.bases.updateColumn.useMutation({
    onSuccess: () => {
      toast.success("Column renamed");
      setEditingColumnId(null);
      setEditColumnName("");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Rename column failed: ${err.message ?? "unknown"}`);
    },
  });

  const deleteColMut = trpc.agentStudio.bases.deleteColumn.useMutation({
    onSuccess: () => {
      toast.success("Column deleted");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Delete column failed: ${err.message ?? "unknown"}`);
    },
  });

  const keyValid =
    key.trim().length > 0 && /^[a-z_][a-z0-9_]*$/i.test(key.trim());
  const formValid = keyValid && name.trim().length > 0;

  function handleCreate() {
    if (!formValid) return;
    createColMut.mutate({
      baseId,
      key: key.trim(),
      name: name.trim(),
      dataType,
    });
  }

  function handleEditColumn(columnId: number, currentName: string) {
    setEditingColumnId(columnId);
    setEditColumnName(currentName);
  }

  function handleSaveEditColumn() {
    if (editingColumnId === null) return;
    const trimmed = editColumnName.trim();
    if (trimmed.length === 0) return;
    updateColMut.mutate({ columnId: editingColumnId, name: trimmed });
  }

  function handleDeleteColumn(columnId: number, columnName: string) {
    if (
      !window.confirm(
        `Delete column "${columnName}" (#${columnId})? Cells under this column will be removed from every row.`,
      )
    ) {
      return;
    }
    deleteColMut.mutate({ columnId });
  }

  const editColumnValid = editColumnName.trim().length > 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Columns</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create column</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ba-col-key">Key</Label>
              <Input
                id="ba-col-key"
                data-testid="ba-col-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="status_field"
                maxLength={64}
              />
              {key !== "" && !keyValid ? (
                <p
                  className="mt-1 text-xs text-destructive"
                  data-testid="ba-col-key-error"
                >
                  Key must be a valid identifier
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ba-col-name">Name</Label>
              <Input
                id="ba-col-name"
                data-testid="ba-col-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Status"
                maxLength={255}
              />
            </div>
            <div>
              <Label htmlFor="ba-col-type">Data type</Label>
              <select
                id="ba-col-type"
                data-testid="ba-col-type"
                className="w-full rounded border bg-background p-2 text-sm"
                value={dataType}
                onChange={(e) => setDataType(e.target.value as ColumnDataType)}
              >
                {COLUMN_DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            disabled={!formValid || createColMut.isPending}
            onClick={handleCreate}
            data-testid="ba-col-create-button"
          >
            {createColMut.isPending ? "Creating…" : "Create column"}
          </Button>
        </div>

        {columns.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="ba-col-empty"
          >
            No columns yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="ba-col-list">
            {columns.map((c) => {
              const isEditing = editingColumnId === c.id;
              return (
                <li
                  key={c.id}
                  data-testid="ba-col-row"
                  className="space-y-2 rounded border bg-background p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{c.id}
                    </span>
                    <span className="font-mono">{c.key}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {c.dataType}
                    </span>
                    {isEditing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingColumnId(null);
                          setEditColumnName("");
                        }}
                        data-testid="ba-col-edit-cancel"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditColumn(c.id, c.name)}
                        data-testid="ba-col-edit"
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteColMut.isPending}
                      onClick={() => handleDeleteColumn(c.id, c.name)}
                      data-testid="ba-col-delete"
                    >
                      Delete
                    </Button>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        data-testid="ba-col-edit-name"
                        value={editColumnName}
                        onChange={(e) => setEditColumnName(e.target.value)}
                        maxLength={255}
                        placeholder="New column name"
                      />
                      <Button
                        type="button"
                        disabled={!editColumnValid || updateColMut.isPending}
                        onClick={handleSaveEditColumn}
                        data-testid="ba-col-edit-save"
                      >
                        {updateColMut.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface RowLike {
  readonly id: number;
  readonly cells: Record<string, unknown>;
  readonly noteId?: number | null;
}

interface RowsSubsectionProps {
  readonly baseId: number;
  readonly columns: ReadonlyArray<ColumnLike>;
  readonly rows: ReadonlyArray<RowLike>;
  readonly onMutate: () => void;
}

function RowsSubsection({
  baseId,
  columns,
  rows,
  onMutate,
}: RowsSubsectionProps) {
  const [cellsJson, setCellsJson] = useState("{}");
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editCellsJson, setEditCellsJson] = useState("");

  const createRowMut = trpc.agentStudio.bases.createRow.useMutation({
    onSuccess: () => {
      toast.success("Row created");
      setCellsJson("{}");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Create row failed: ${err.message ?? "unknown"}`);
    },
  });
  const updateRowMut = trpc.agentStudio.bases.updateRow.useMutation({
    onSuccess: () => {
      toast.success("Row updated");
      setEditingRowId(null);
      setEditCellsJson("");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Update row failed: ${err.message ?? "unknown"}`);
    },
  });
  const deleteRowMut = trpc.agentStudio.bases.deleteRow.useMutation({
    onSuccess: () => {
      toast.success("Row deleted");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Delete row failed: ${err.message ?? "unknown"}`);
    },
  });

  const parsedCells = parseJsonRecord(cellsJson);
  const formValid = parsedCells !== null;
  const parsedEditCells = parseJsonRecord(editCellsJson);
  const editFormValid =
    editingRowId !== null && parsedEditCells !== null;

  function handleCreate() {
    if (!formValid) return;
    createRowMut.mutate({
      baseId,
      cells: parsedCells as Record<string, unknown>,
    });
  }

  function handleEdit(rowId: number, currentCells: Record<string, unknown>) {
    setEditingRowId(rowId);
    setEditCellsJson(JSON.stringify(currentCells, null, 2));
  }

  function handleSaveEdit() {
    if (!editFormValid) return;
    updateRowMut.mutate({
      rowId: editingRowId as number,
      cells: parsedEditCells as Record<string, unknown>,
    });
  }

  function handleDelete(rowId: number) {
    if (!window.confirm(`Delete row #${rowId}?`)) return;
    deleteRowMut.mutate({ rowId });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Rows</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Create row</SectionLabel>
          <p className="text-xs text-muted-foreground">
            Cells must be a JSON object keyed by column key. Available
            columns:{" "}
            {columns.length === 0
              ? "(none)"
              : columns.map((c) => c.key).join(", ")}
          </p>
          <textarea
            data-testid="ba-row-create-cells"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            rows={3}
            value={cellsJson}
            onChange={(e) => setCellsJson(e.target.value)}
            placeholder='{"status_field": "open"}'
          />
          {!formValid ? (
            <p
              className="text-xs text-destructive"
              data-testid="ba-row-create-error"
            >
              Cells must be a JSON object.
            </p>
          ) : null}
          <Button
            type="button"
            disabled={!formValid || createRowMut.isPending}
            onClick={handleCreate}
            data-testid="ba-row-create-button"
          >
            {createRowMut.isPending ? "Creating…" : "Create row"}
          </Button>
        </div>

        {rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="ba-row-empty"
          >
            No rows yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="ba-row-list">
            {rows.map((r) => {
              const isEditing = editingRowId === r.id;
              return (
                <li
                  key={r.id}
                  data-testid="ba-row-row"
                  className="space-y-2 rounded border bg-background p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{r.id}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs">
                      {JSON.stringify(r.cells)}
                    </span>
                    {isEditing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRowId(null);
                          setEditCellsJson("");
                        }}
                        data-testid="ba-row-edit-cancel"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(r.id, r.cells)}
                        data-testid="ba-row-edit"
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteRowMut.isPending}
                      onClick={() => handleDelete(r.id)}
                      data-testid="ba-row-delete"
                    >
                      Delete
                    </Button>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        data-testid="ba-row-edit-cells"
                        className="w-full rounded border bg-background p-2 font-mono text-xs"
                        rows={4}
                        value={editCellsJson}
                        onChange={(e) => setEditCellsJson(e.target.value)}
                      />
                      {parsedEditCells === null ? (
                        <p
                          className="text-xs text-destructive"
                          data-testid="ba-row-edit-error"
                        >
                          Cells must be a JSON object.
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        disabled={!editFormValid || updateRowMut.isPending}
                        onClick={handleSaveEdit}
                        data-testid="ba-row-edit-save"
                      >
                        {updateRowMut.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
