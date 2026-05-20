/**
 * VaultExplorer — Product Work item 15.
 *
 * Hierarchical vault → folder → note tree for the workspace shell.
 * Includes inline "Create vault" + "Create note" affordances so
 * the operator can bootstrap an empty workspace from zero state.
 *
 * Reuse-first:
 *   - tRPC: trpc.agentStudio.vault.{listMyVaults, listNotes,
 *     createVault, createNote} (existing)
 *   - No new server routes for this component
 *
 * Permission handling:
 *   - Hidden notes/folders are filtered server-side by the vault
 *     router; this component only renders what comes back.
 *   - Empty vault → empty_vault state slide + "Create vault" CTA.
 *   - Loading + error → handled via WorkspaceStateLayer.
 *
 * Slug derivation: a minimal kebab-case slugifier converts the
 * human-typed name/title into a server-compatible slug. Operators
 * who want custom slugs can edit via the tRPC API directly until a
 * full-fidelity form is added.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import VaultFsSyncPanel from "./VaultFsSyncPanel";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

interface VaultExplorerProps {
  readonly selectedVaultId: number | null;
  readonly selectedNoteId: number | null;
  readonly onSelectVault: (vaultId: number) => void;
  readonly onSelectNote: (noteId: number) => void;
}

export default function VaultExplorer({
  selectedVaultId,
  selectedNoteId,
  onSelectVault,
  onSelectNote,
}: VaultExplorerProps): React.ReactElement {
  const utils = trpc.useUtils();
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined as never,
  );
  const notesQuery = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: selectedVaultId ?? 0, limit: 200 },
    { enabled: typeof selectedVaultId === "number" && selectedVaultId > 0 },
  );
  // Tag chip filter — scans the latest version of every note in the
  // vault server-side. Capped at 500 by the procedure itself. The
  // response shape is { tags: [{ tag, count, noteIds }] }. We only
  // surface the top 30 tags as chips to keep the sidebar tidy; an
  // operator can always rely on the text filter for tags outside
  // that window.
  const tagsForVaultQuery = trpc.agentStudio.vault.listTagsForVault.useQuery(
    { vaultId: selectedVaultId ?? 0 },
    { enabled: typeof selectedVaultId === "number" && selectedVaultId > 0 },
  );
  // Folder tree — sourced from agsVaultFolders. The Vault Explorer
  // composes (folders + notes) into a hierarchical tree when no
  // filter is active. When a filter (text or tag) is active the
  // tree collapses to a flat hit list (the tree shape is noise
  // when you're searching).
  const foldersForVaultQuery = trpc.agentStudio.vault.listFolders.useQuery(
    { vaultId: selectedVaultId ?? 0 },
    { enabled: typeof selectedVaultId === "number" && selectedVaultId > 0 },
  );

  const [showVaultForm, setShowVaultForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [noteFilter, setNoteFilter] = useState("");
  const [selectedTags, setSelectedTags] = useState<ReadonlyArray<string>>([]);
  // Folder ids that are currently expanded in the tree. Undefined in
  // the Set === collapsed. Defaults to all-expanded on every vault
  // switch (initialized in the effect below) so operators don't have
  // to click through every folder on first paint.
  const [expandedFolderIds, setExpandedFolderIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );

  // Clear text + tag filters when the operator switches vaults —
  // keeping stale filters across an unrelated note list would be
  // surprising and the tag set itself is vault-scoped. Also reset
  // the expanded-folders set; the next folder-query result seeds it.
  useEffect(() => {
    setNoteFilter("");
    setSelectedTags([]);
    setExpandedFolderIds(new Set<number>());
  }, [selectedVaultId]);

  const allNotes = notesQuery.data ?? [];
  const allTags = useMemo(
    () =>
      (tagsForVaultQuery.data?.tags ?? []) as ReadonlyArray<{
        tag: string;
        count: number;
        noteIds: ReadonlyArray<number>;
      }>,
    [tagsForVaultQuery.data],
  );

  // OR-semantics tag membership: a note passes the tag filter if it
  // appears in the noteIds list of ANY selected tag. (AND would be a
  // valid alternate model but most note-app conventions use OR.)
  const allowedNoteIdsByTags = useMemo<ReadonlySet<number> | null>(() => {
    if (selectedTags.length === 0) return null;
    const selectedSet = new Set(selectedTags);
    const allow = new Set<number>();
    for (const t of allTags) {
      if (!selectedSet.has(t.tag)) continue;
      for (const id of t.noteIds) allow.add(id);
    }
    return allow;
  }, [allTags, selectedTags]);

  const filteredNotes = useMemo(() => {
    const q = noteFilter.trim().toLowerCase();
    return allNotes.filter((n) => {
      if (allowedNoteIdsByTags !== null && !allowedNoteIdsByTags.has(n.id)) {
        return false;
      }
      if (q.length === 0) return true;
      const title = (n.title ?? "").toLowerCase();
      const slug = (n.slug ?? "").toLowerCase();
      return title.includes(q) || slug.includes(q);
    });
  }, [allNotes, noteFilter, allowedNoteIdsByTags]);

  // Folder list (flat) — the tree shape is built inside FolderTree.
  const allFolders = useMemo(
    () =>
      (foldersForVaultQuery.data ?? []) as ReadonlyArray<{
        id: number;
        vaultId: number;
        parentFolderId: number | null;
        name: string;
        path: string;
      }>,
    [foldersForVaultQuery.data],
  );

  // Default every folder to expanded the first time the folders
  // query resolves for a given vault. Subsequent toggles are owned
  // by `onToggleFolder` below. Re-runs when the folder set changes
  // identity (e.g. after createFolder lands) — but skip when the
  // operator has explicitly collapsed a folder so we don't yank it
  // open on a refetch.
  const seededExpansionForVaultRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof selectedVaultId !== "number" || selectedVaultId <= 0) return;
    if (seededExpansionForVaultRef.current === selectedVaultId) return;
    if (foldersForVaultQuery.isLoading) return;
    seededExpansionForVaultRef.current = selectedVaultId;
    setExpandedFolderIds(new Set(allFolders.map((f) => f.id)));
  }, [selectedVaultId, foldersForVaultQuery.isLoading, allFolders]);

  // Reset the seeded-vault sentinel when the operator switches
  // vaults so the next vault gets its own default-expanded pass.
  useEffect(() => {
    seededExpansionForVaultRef.current = null;
  }, [selectedVaultId]);

  const isFilterActive =
    noteFilter.trim().length > 0 || selectedTags.length > 0;

  function toggleTag(tag: string): void {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  const createVaultMutation = trpc.agentStudio.vault.createVault.useMutation({
    onSuccess: (vault) => {
      setShowVaultForm(false);
      setVaultName("");
      setFormError(null);
      void utils.agentStudio.vault.listMyVaults.invalidate();
      if (vault && typeof (vault as { id?: number }).id === "number") {
        onSelectVault((vault as { id: number }).id);
      }
    },
    onError: (err) => setFormError(err.message),
  });

  const createNoteMutation = trpc.agentStudio.vault.createNote.useMutation({
    onSuccess: (note) => {
      setShowNoteForm(false);
      setNoteTitle("");
      setFormError(null);
      void utils.agentStudio.vault.listNotes.invalidate();
      if (note && typeof (note as { id?: number }).id === "number") {
        onSelectNote((note as { id: number }).id);
      }
    },
    onError: (err) => setFormError(err.message),
  });

  function handleCreateVault(e: React.FormEvent) {
    e.preventDefault();
    const name = vaultName.trim();
    if (name.length === 0) {
      setFormError("Name required");
      return;
    }
    createVaultMutation.mutate({ name, slug: toSlug(name) });
  }

  function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (typeof selectedVaultId !== "number" || selectedVaultId <= 0) {
      setFormError("Pick a vault first");
      return;
    }
    const title = noteTitle.trim();
    if (title.length === 0) {
      setFormError("Title required");
      return;
    }
    createNoteMutation.mutate({
      vaultId: selectedVaultId,
      title,
      slug: toSlug(title),
      contentMd: `# ${title}\n\n`,
    });
  }

  const vaultsState = useMemo(() => {
    if (vaultsQuery.isLoading) return "loading" as const;
    if (vaultsQuery.error) {
      return classifyWorkspaceState({
        trpcError: { code: vaultsQuery.error.data?.code, message: vaultsQuery.error.message },
      });
    }
    if ((vaultsQuery.data ?? []).length === 0) return "empty_vault" as const;
    return null;
  }, [vaultsQuery.isLoading, vaultsQuery.error, vaultsQuery.data]);

  // Empty-vault state STILL needs a "Create vault" CTA — render the
  // form alongside the empty-state slide rather than a hard return.
  if (vaultsState !== null && vaultsState !== "empty_vault") {
    return (
      <aside
        className="border-r p-3 w-64 shrink-0 bg-gray-50/30"
        data-testid="vault-explorer"
      >
        <WorkspaceStateLayer state={vaultsState} />
      </aside>
    );
  }

  const isEmpty = vaultsState === "empty_vault";

  return (
    <aside
      className="border-r p-3 w-64 shrink-0 bg-gray-50/30 overflow-auto"
      data-testid="vault-explorer"
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold text-xs uppercase text-gray-500">
          Vaults
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="vault-explorer-header-new-note-btn"
            className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
            disabled={
              typeof selectedVaultId !== "number" ||
              selectedVaultId <= 0 ||
              (vaultsQuery.data ?? []).length === 0
            }
            title={
              typeof selectedVaultId !== "number" || selectedVaultId <= 0
                ? "Select a vault first"
                : "Create a new note in the selected vault"
            }
            onClick={() => {
              setShowNoteForm((v) => !v);
              setFormError(null);
            }}
          >
            {showNoteForm ? "Cancel note" : "+ New note"}
          </button>
          <button
            type="button"
            data-testid="vault-explorer-new-vault-btn"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => {
              setShowVaultForm((v) => !v);
              setFormError(null);
            }}
          >
            {showVaultForm ? "Cancel" : "+ New vault"}
          </button>
        </div>
      </div>

      {showVaultForm && (
        <form
          onSubmit={handleCreateVault}
          className="mb-3 space-y-1.5"
          data-testid="vault-explorer-new-vault-form"
        >
          <input
            type="text"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder="Vault name"
            data-testid="vault-explorer-new-vault-name"
            className="w-full text-sm rounded border px-2 py-1"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              type="submit"
              data-testid="vault-explorer-new-vault-submit"
              disabled={createVaultMutation.isPending}
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createVaultMutation.isPending ? "Creating…" : "Create vault"}
            </button>
          </div>
        </form>
      )}

      {isEmpty && !showVaultForm && (
        <div className="mb-3" data-testid="vault-explorer-empty-state">
          <WorkspaceStateLayer state="empty_vault" />
          <p className="text-xs text-gray-500 mt-2">
            Click "+ New" above to create your first vault.
          </p>
        </div>
      )}

      {formError && (
        <p
          className="text-xs text-red-600 mb-2"
          data-testid="vault-explorer-form-error"
        >
          {formError}
        </p>
      )}

      {!isEmpty && (
        <>
          {/* Dropdown selector — replaces the previous list-of-buttons
              UX. Operators pick a vault from a single <select>; the
              note list, FS-sync affordance, and inline new-note form
              all hang off the selected vault below. */}
          <div className="mb-2">
            <label
              className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1"
              htmlFor="vault-explorer-vault-select"
            >
              Vault
            </label>
            <select
              id="vault-explorer-vault-select"
              data-testid="vault-explorer-vault-select"
              className="w-full text-sm rounded border px-2 py-1 bg-white"
              value={selectedVaultId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                const id = Number.parseInt(v, 10);
                if (Number.isFinite(id) && id > 0) {
                  onSelectVault(id);
                }
              }}
            >
              <option value="" disabled>
                — pick a vault —
              </option>
              {(vaultsQuery.data ?? []).map((vault) => (
                <option
                  key={vault.id}
                  value={vault.id}
                  data-testid={`vault-explorer-vault-option-${vault.id}`}
                >
                  📁 {vault.name ?? `Vault ${vault.id}`}
                </option>
              ))}
            </select>
          </div>

          {typeof selectedVaultId === "number" && selectedVaultId > 0 && (
            <div data-testid="vault-explorer-selected-vault">
              <div className="mt-1 mb-1">
                <button
                  type="button"
                  data-testid="vault-explorer-new-note-btn"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => {
                    setShowNoteForm((v) => !v);
                    setFormError(null);
                  }}
                >
                  {showNoteForm ? "Cancel" : "+ New note"}
                </button>
              </div>
              {showNoteForm && (
                <form
                  onSubmit={handleCreateNote}
                  className="mb-2 space-y-1.5"
                  data-testid="vault-explorer-new-note-form"
                >
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title"
                    data-testid="vault-explorer-new-note-title"
                    className="w-full text-sm rounded border px-2 py-1"
                    autoFocus
                  />
                  <button
                    type="submit"
                    data-testid="vault-explorer-new-note-submit"
                    disabled={createNoteMutation.isPending}
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createNoteMutation.isPending ? "Creating…" : "Create note"}
                  </button>
                </form>
              )}
              {/* Client-side substring filter over the already-fetched
                  note list. Matches case-insensitively against title
                  and slug. The list above runs `listNotes` with
                  limit: 200, so this is bounded; if we ever raise the
                  limit, swap for a server-side `q` param. */}
              <div className="mt-1 mb-1 relative">
                <input
                  type="search"
                  value={noteFilter}
                  onChange={(e) => setNoteFilter(e.target.value)}
                  placeholder="Filter notes…"
                  aria-label="Filter notes"
                  data-testid="vault-explorer-note-filter-input"
                  className="w-full text-sm rounded border px-2 py-1 pr-6"
                />
                {noteFilter.length > 0 && (
                  <button
                    type="button"
                    aria-label="Clear note filter"
                    data-testid="vault-explorer-note-filter-clear"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-1"
                    onClick={() => setNoteFilter("")}
                  >
                    ×
                  </button>
                )}
              </div>
              {/* Tag chip filter — top 30 tags by occurrence. Click a
                  chip to toggle it into the filter. Multi-select with
                  OR semantics (a note matches if it carries any of
                  the selected tags). AND-combined with the text
                  filter above. */}
              {allTags.length > 0 && (
                <div
                  className="mb-1"
                  data-testid="vault-explorer-tag-filter-chips"
                >
                  <div className="flex flex-wrap gap-1">
                    {allTags.slice(0, 30).map((t) => {
                      const isOn = selectedTags.includes(t.tag);
                      return (
                        <button
                          key={t.tag}
                          type="button"
                          data-testid={`vault-explorer-tag-filter-chip-${t.tag}`}
                          data-active={isOn ? "true" : "false"}
                          onClick={() => toggleTag(t.tag)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            isOn
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                          }`}
                          title={`${t.count} use${t.count === 1 ? "" : "s"}`}
                        >
                          #{t.tag}
                        </button>
                      );
                    })}
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      type="button"
                      data-testid="vault-explorer-tag-filter-clear"
                      onClick={() => setSelectedTags([])}
                      className="text-[10px] text-blue-600 hover:underline mt-1"
                    >
                      Clear tags ({selectedTags.length})
                    </button>
                  )}
                </div>
              )}
              {(noteFilter.trim().length > 0 || selectedTags.length > 0) &&
                !notesQuery.isLoading && (
                <div
                  className="text-[10px] text-gray-500 mb-1 pl-3"
                  data-testid="vault-explorer-note-filter-count"
                >
                  {filteredNotes.length} of {allNotes.length} notes
                </div>
              )}
              {isFilterActive ? (
                <NoteList
                  notes={filteredNotes}
                  loading={notesQuery.isLoading}
                  error={notesQuery.error ?? null}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={onSelectNote}
                  emptyMessage="No notes match this filter."
                />
              ) : (
                <FolderTree
                  folders={allFolders}
                  notes={allNotes}
                  loading={notesQuery.isLoading || foldersForVaultQuery.isLoading}
                  error={
                    (notesQuery.error ?? foldersForVaultQuery.error) ?? null
                  }
                  selectedNoteId={selectedNoteId}
                  onSelectNote={onSelectNote}
                  expandedFolderIds={expandedFolderIds}
                  onToggleFolder={(folderId) =>
                    setExpandedFolderIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(folderId)) next.delete(folderId);
                      else next.add(folderId);
                      return next;
                    })
                  }
                />
              )}
              {/* Track A — A7 — FS-sync settings panel for the
                  selected vault. Sits below the note list. */}
              <div className="mt-2">
                <FsSyncSettingsAffordance vaultId={selectedVaultId} />
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

/**
 * Track A — A7. Collapsible affordance that mounts VaultFsSyncPanel.
 * Default-collapsed so the vault row stays tidy; click to expand.
 */
function FsSyncSettingsAffordance({
  vaultId,
}: {
  vaultId: number;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1" data-testid="vault-explorer-fs-sync-affordance">
      <button
        type="button"
        data-testid="vault-explorer-fs-sync-toggle"
        className="text-xs text-gray-500 hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾ FS sync settings" : "▸ FS sync settings"}
      </button>
      {open && <VaultFsSyncPanel vaultId={vaultId} />}
    </div>
  );
}

interface NoteListProps {
  readonly notes: ReadonlyArray<{ id: number; title?: string | null; slug?: string | null }>;
  readonly loading: boolean;
  readonly error: { data?: { code?: string }; message?: string } | null;
  readonly selectedNoteId: number | null;
  readonly onSelectNote: (noteId: number) => void;
  readonly emptyMessage?: string;
}

function NoteList({
  notes,
  loading,
  error,
  selectedNoteId,
  onSelectNote,
  emptyMessage,
}: NoteListProps): React.ReactElement {
  if (loading) {
    return <div className="pl-4 text-xs text-gray-500" data-testid="note-list-loading">Loading notes…</div>;
  }
  if (error) {
    return (
      <div
        className="pl-4 text-xs text-red-500"
        data-testid="note-list-error"
        data-raw-error={error.message ?? ""}
      >
        Could not load notes.
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="pl-4 text-xs text-gray-500" data-testid="note-list-empty">
        {emptyMessage ?? "No notes in this vault."}
      </div>
    );
  }
  return (
    <ul className="pl-3 mt-1 space-y-0.5" data-testid="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            data-testid={`note-list-item-${note.id}`}
            className={`text-left text-sm w-full rounded px-2 py-0.5 hover:bg-gray-100 ${
              note.id === selectedNoteId ? "bg-blue-50 font-medium" : ""
            }`}
            onClick={() => onSelectNote(note.id)}
          >
            📄 {note.title ?? note.slug ?? `Note ${note.id}`}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface FolderTreeProps {
  readonly folders: ReadonlyArray<{
    id: number;
    parentFolderId: number | null;
    name: string;
  }>;
  readonly notes: ReadonlyArray<{
    id: number;
    title?: string | null;
    slug?: string | null;
    folderId?: number | null;
  }>;
  readonly loading: boolean;
  readonly error: { data?: { code?: string }; message?: string } | null;
  readonly selectedNoteId: number | null;
  readonly onSelectNote: (noteId: number) => void;
  readonly expandedFolderIds: ReadonlySet<number>;
  readonly onToggleFolder: (folderId: number) => void;
}

/**
 * Hierarchical folder → notes tree. Notes whose `folderId` is null
 * render at the root level alongside top-level folders. Each folder
 * row toggles its own expansion state; descendant folders + notes
 * render with depth-based indentation. Empty folders render with a
 * faint "(empty)" tag so the operator can still see the structure.
 */
function FolderTree({
  folders,
  notes,
  loading,
  error,
  selectedNoteId,
  onSelectNote,
  expandedFolderIds,
  onToggleFolder,
}: FolderTreeProps): React.ReactElement {
  // Index folders + notes by parent for O(1) lookups during render.
  const childFoldersByParent = useMemo(() => {
    const m = new Map<number | null, typeof folders[number][]>();
    for (const f of folders) {
      const key = f.parentFolderId ?? null;
      const list = m.get(key) ?? [];
      list.push(f);
      m.set(key, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [folders]);

  const notesByFolder = useMemo(() => {
    const m = new Map<number | null, typeof notes[number][]>();
    for (const n of notes) {
      const key = n.folderId ?? null;
      const list = m.get(key) ?? [];
      list.push(n);
      m.set(key, list);
    }
    return m;
  }, [notes]);

  if (loading) {
    return (
      <div className="pl-4 text-xs text-gray-500" data-testid="folder-tree-loading">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="pl-4 text-xs text-red-500"
        data-testid="folder-tree-error"
        data-raw-error={error.message ?? ""}
      >
        Could not load folders.
      </div>
    );
  }

  const rootFolders = childFoldersByParent.get(null) ?? [];
  const rootNotes = notesByFolder.get(null) ?? [];
  if (rootFolders.length === 0 && rootNotes.length === 0 && notes.length === 0) {
    return (
      <div className="pl-4 text-xs text-gray-500" data-testid="folder-tree-empty">
        No notes in this vault.
      </div>
    );
  }

  return (
    <ul className="pl-1 mt-1 space-y-0.5" data-testid="folder-tree">
      <FolderTreeLevel
        depth={0}
        childFolders={rootFolders}
        notes={rootNotes}
        childFoldersByParent={childFoldersByParent}
        notesByFolder={notesByFolder}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        expandedFolderIds={expandedFolderIds}
        onToggleFolder={onToggleFolder}
      />
    </ul>
  );
}

interface FolderTreeLevelProps {
  readonly depth: number;
  readonly childFolders: ReadonlyArray<{
    id: number;
    parentFolderId: number | null;
    name: string;
  }>;
  readonly notes: ReadonlyArray<{
    id: number;
    title?: string | null;
    slug?: string | null;
    folderId?: number | null;
  }>;
  readonly childFoldersByParent: Map<
    number | null,
    Array<{ id: number; parentFolderId: number | null; name: string }>
  >;
  readonly notesByFolder: Map<
    number | null,
    Array<{
      id: number;
      title?: string | null;
      slug?: string | null;
      folderId?: number | null;
    }>
  >;
  readonly selectedNoteId: number | null;
  readonly onSelectNote: (noteId: number) => void;
  readonly expandedFolderIds: ReadonlySet<number>;
  readonly onToggleFolder: (folderId: number) => void;
}

function FolderTreeLevel({
  depth,
  childFolders,
  notes,
  childFoldersByParent,
  notesByFolder,
  selectedNoteId,
  onSelectNote,
  expandedFolderIds,
  onToggleFolder,
}: FolderTreeLevelProps): React.ReactElement {
  // Indent 12px per depth. Tailwind doesn't have dynamic spacing so
  // we use an inline style — the only call site is here, so the
  // ad-hoc inline-style does not leak elsewhere.
  const indent = depth === 0 ? undefined : { paddingLeft: `${depth * 12}px` };
  return (
    <>
      {childFolders.map((folder) => {
        const isOpen = expandedFolderIds.has(folder.id);
        const subFolders = childFoldersByParent.get(folder.id) ?? [];
        const folderNotes = notesByFolder.get(folder.id) ?? [];
        return (
          <li key={`folder-${folder.id}`} style={indent}>
            <button
              type="button"
              data-testid={`folder-row-${folder.id}`}
              data-expanded={isOpen ? "true" : "false"}
              className="text-left text-sm w-full rounded px-2 py-0.5 hover:bg-gray-100 font-medium text-gray-700"
              onClick={() => onToggleFolder(folder.id)}
            >
              {isOpen ? "▾" : "▸"} 📁 {folder.name}
              {subFolders.length === 0 && folderNotes.length === 0 && (
                <span className="text-[10px] text-gray-400 ml-1">(empty)</span>
              )}
            </button>
            {isOpen && (subFolders.length > 0 || folderNotes.length > 0) && (
              <ul
                className="space-y-0.5"
                data-testid={`folder-children-${folder.id}`}
              >
                <FolderTreeLevel
                  depth={depth + 1}
                  childFolders={subFolders}
                  notes={folderNotes}
                  childFoldersByParent={childFoldersByParent}
                  notesByFolder={notesByFolder}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={onSelectNote}
                  expandedFolderIds={expandedFolderIds}
                  onToggleFolder={onToggleFolder}
                />
              </ul>
            )}
          </li>
        );
      })}
      {notes.map((note) => (
        <li key={`note-${note.id}`} style={indent}>
          <button
            type="button"
            data-testid={`note-list-item-${note.id}`}
            className={`text-left text-sm w-full rounded px-2 py-0.5 hover:bg-gray-100 ${
              note.id === selectedNoteId ? "bg-blue-50 font-medium" : ""
            }`}
            onClick={() => onSelectNote(note.id)}
          >
            📄 {note.title ?? note.slug ?? `Note ${note.id}`}
          </button>
        </li>
      ))}
    </>
  );
}
