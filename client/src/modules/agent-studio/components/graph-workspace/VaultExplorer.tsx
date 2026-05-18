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

import React, { useMemo, useState } from "react";
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

  const [showVaultForm, setShowVaultForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

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
        <button
          type="button"
          data-testid="vault-explorer-new-vault-btn"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => {
            setShowVaultForm((v) => !v);
            setFormError(null);
          }}
        >
          {showVaultForm ? "Cancel" : "+ New"}
        </button>
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
        <ul className="space-y-1">
          {(vaultsQuery.data ?? []).map((vault) => (
            <li key={vault.id}>
              <button
                type="button"
                data-testid={`vault-explorer-vault-${vault.id}`}
                className={`text-left text-sm w-full rounded px-2 py-1 hover:bg-gray-100 ${
                  vault.id === selectedVaultId ? "bg-blue-50 font-medium" : ""
                }`}
                onClick={() => onSelectVault(vault.id)}
              >
                📁 {vault.name ?? `Vault ${vault.id}`}
              </button>
              {vault.id === selectedVaultId && (
                <>
                  <div className="pl-3 mt-1 mb-1">
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
                      className="pl-3 mb-2 space-y-1.5"
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
                  <NoteList
                    notes={notesQuery.data ?? []}
                    loading={notesQuery.isLoading}
                    error={notesQuery.error ?? null}
                    selectedNoteId={selectedNoteId}
                    onSelectNote={onSelectNote}
                  />
                  {/* Track A — A7 — FS-sync settings panel for the
                      selected vault. Lives at the bottom of the
                      selected-vault expansion so operators see the
                      sync state alongside the note list. */}
                  <div className="mt-2 px-3">
                    <FsSyncSettingsAffordance vaultId={vault.id} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
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
}

function NoteList({
  notes,
  loading,
  error,
  selectedNoteId,
  onSelectNote,
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
        No notes in this vault.
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
