/**
 * MarkdownEditorPane — Product Work items 14 + 16.
 *
 * Three-mode Markdown surface: read / edit / source.
 *
 * Reuse-first:
 *   - Read mode: AppStreamdown (existing react-markdown renderer)
 *   - Edit mode: **CodeMirror 6** with markdown language (B2). Replaces
 *     the prior plain textarea. Source mode keeps the textarea for
 *     power users who want a raw view of frontmatter + wikilinks.
 *   - Source mode: monospaced raw Markdown view (textarea)
 *
 * Save path:
 *   - trpc.agentStudio.vault.updateNote (existing CRDT-aware procedure)
 *   - Conflict detection comes back as `{conflict: true, latestVersion}`
 *   - **Auto-save (B1):** dirty drafts auto-flush after AUTO_SAVE_DEBOUNCE_MS
 *     of typing inactivity. The "Save now" button stays as a forcing
 *     function. Conflicts pause the debounce (the user must resolve via
 *     the WorkspaceStateLayer save_conflict surface before continuing).
 *
 * Read-only:
 *   - Driven by the `readOnly` prop; UI disables editing affordances
 *     when true. The server enforces the same rule independently.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppStreamdown } from "../../../../components/markdown/AppStreamdown";
import { trpc } from "../../../../lib/trpc";
import CodeMirrorMdEditor from "./CodeMirrorMdEditor";
import { wikilinkAutocomplete } from "./wikilink-autocomplete";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

type Mode = "read" | "edit" | "source";

/**
 * Quiet-period after the last edit before auto-save fires. 1500ms is
 * long enough that typing bursts coalesce into one save round-trip
 * but short enough that the operator feels the save was "immediate"
 * (Obsidian's autosave feels similar). Conflict detection upstream
 * means a slightly longer debounce is safe — concurrent edits surface
 * via the save_conflict UI rather than silently overwriting.
 */
const AUTO_SAVE_DEBOUNCE_MS = 1500;

export interface MarkdownEditorPaneProps {
  readonly noteId: number;
  /** When true, hide edit/source toggles and forbid save. */
  readonly readOnly?: boolean;
  readonly onNoteSaved?: (noteId: number) => void;
}

export default function MarkdownEditorPane({
  noteId,
  readOnly = false,
  onNoteSaved,
}: MarkdownEditorPaneProps): React.ReactElement {
  const noteQuery = trpc.agentStudio.vault.getNote.useQuery({ noteId });
  const updateMutation = trpc.agentStudio.vault.updateNote.useMutation();
  const utils = trpc.useUtils();
  // Track B — B3 — vault notes for `[[wikilink]]` autocomplete.
  // Gated on noteQuery.data?.note?.vaultId so we don't kick off the
  // list query until we know which vault the current note lives in.
  const vaultIdForList = noteQuery.data?.note?.vaultId ?? 0;
  const notesForLinkQuery = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: vaultIdForList, limit: 200 },
    { enabled: vaultIdForList > 0 },
  );

  const [mode, setMode] = useState<Mode>("read");
  const [draftMd, setDraftMd] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);

  const upstreamMd = noteQuery.data?.latestVersion?.contentMd ?? "";
  const dirty = draftMd !== null && draftMd !== upstreamMd;

  // Reset draft when switching notes.
  useEffect(() => {
    setDraftMd(null);
    setMode("read");
    setSavedAt(null);
    setConflict(false);
  }, [noteId]);

  const liveText = useMemo(
    () => (draftMd !== null ? draftMd : upstreamMd),
    [draftMd, upstreamMd],
  );

  // Track B — B3 — wikilink autocomplete extension. Memoized on the
  // notes list — the editor only re-mounts when the extension array
  // identity changes, so a stable memo keeps cursor + history alive
  // across keystrokes. The current note is excluded from suggestions
  // (we don't typically wikilink to ourselves).
  const wikilinkExtensionList = useMemo(() => {
    const sourceNotes = (notesForLinkQuery.data ?? []) as Array<{
      id: number;
      slug?: string | null;
      title?: string | null;
    }>;
    const suggestions = sourceNotes
      .filter((n) => n.id !== noteId && typeof n.slug === "string")
      .map((n) => ({ slug: n.slug as string, title: n.title ?? null }));
    return [
      wikilinkAutocomplete({
        getSuggestions: () => suggestions,
      }),
    ];
  }, [notesForLinkQuery.data, noteId]);

  // NOTE: handleSave + the auto-save effect live above the early
  // returns below so React's rules of hooks aren't violated when
  // isLoading / error short-circuits a render.
  const expectedVersion = noteQuery.data?.latestVersion?.version ?? null;
  const handleSave = useCallback(async (): Promise<void> => {
    if (readOnly || !dirty || draftMd === null) return;
    try {
      const result = await updateMutation.mutateAsync({
        noteId,
        contentMd: draftMd,
        expectedVersion: expectedVersion ?? undefined,
      } as never);
      const r = result as { conflict?: boolean; updated?: boolean };
      if (r.conflict) {
        setConflict(true);
        return;
      }
      setConflict(false);
      setSavedAt(Date.now());
      setDraftMd(null);
      await utils.agentStudio.vault.getNote.invalidate({ noteId });
      onNoteSaved?.(noteId);
    } catch {
      // The error path stays opaque to the user (we never leak raw
      // mutation errors). The dirty draft is preserved so the
      // operator can retry — auto-save will pick it up again on the
      // next typing burst, or they can hit "Save now" manually.
    }
  }, [
    readOnly,
    dirty,
    draftMd,
    noteId,
    expectedVersion,
    updateMutation,
    utils,
    onNoteSaved,
  ]);

  // Debounced auto-save (B1). Reschedules on every keystroke (the
  // cleanup clearTimeout) so the save only fires AUTO_SAVE_DEBOUNCE_MS
  // after typing stops. Paused while a conflict is unresolved — the
  // operator must reconcile via the save_conflict surface before
  // further edits flush.
  useEffect(() => {
    if (!dirty || readOnly || conflict) return;
    if (updateMutation.isPending) return;
    const handle = setTimeout(() => {
      void handleSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [draftMd, dirty, readOnly, conflict, updateMutation.isPending, handleSave]);

  if (noteQuery.isLoading) {
    return (
      <div className="flex-1 p-3" data-testid="markdown-editor-pane">
        <WorkspaceStateLayer state="loading" />
      </div>
    );
  }
  if (noteQuery.error) {
    // Map the tRPC error code (FORBIDDEN / TIMEOUT / etc.) to the
    // appropriate WorkspaceState rather than always saying
    // "Permission denied" — a 404 / 500 / timeout each tell the
    // operator something different about what to do next.
    const state = classifyWorkspaceState({
      trpcError: {
        code: noteQuery.error.data?.code,
        message: noteQuery.error.message,
      },
    });
    return (
      <div className="flex-1 p-3" data-testid="markdown-editor-pane">
        <WorkspaceStateLayer
          state={state}
          rawErrorForDevtools={noteQuery.error.message}
        />
      </div>
    );
  }

  return (
    <section
      className="flex-1 flex flex-col min-h-0"
      data-testid="markdown-editor-pane"
      data-note-id={noteId}
      data-dirty={dirty ? "true" : "false"}
      data-read-only={readOnly ? "true" : "false"}
    >
      <header className="flex items-center justify-between border-b px-3 py-2 gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {noteQuery.data?.note?.title ?? `Note ${noteId}`}
          </span>
          {updateMutation.isPending && (
            <span
              className="text-sky-600 text-xs"
              data-testid="markdown-editor-saving-flag"
            >
              saving…
            </span>
          )}
          {dirty && !updateMutation.isPending && (
            <span
              className="text-amber-600 text-xs"
              data-testid="markdown-editor-dirty-flag"
            >
              ● editing
            </span>
          )}
          {savedAt !== null && !dirty && !updateMutation.isPending && (
            <span
              className="text-emerald-600 text-xs"
              data-testid="markdown-editor-saved-flag"
            >
              ✓ saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <ModeButton current={mode} target="read" setMode={setMode} disabled={false} />
          <ModeButton current={mode} target="edit" setMode={setMode} disabled={readOnly} />
          <ModeButton current={mode} target="source" setMode={setMode} disabled={false} />
          <button
            type="button"
            disabled={readOnly || !dirty || updateMutation.isPending}
            data-testid="markdown-editor-save"
            onClick={() => void handleSave()}
            title="Auto-save fires after typing pauses; this button forces it immediately."
            className="ml-2 px-2 py-1 rounded border text-xs disabled:opacity-50"
          >
            Save now
          </button>
        </div>
      </header>

      {conflict && (
        <div className="px-3 py-2">
          <WorkspaceStateLayer
            state="save_conflict"
            onAction={() => {
              setConflict(false);
              setDraftMd(null);
              void utils.agentStudio.vault.getNote.invalidate({ noteId });
            }}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-3" data-testid="markdown-editor-body">
        {mode === "read" && <AppStreamdown>{liveText}</AppStreamdown>}
        {mode === "edit" && (
          <CodeMirrorMdEditor
            testId="markdown-editor-cm-edit"
            value={liveText}
            readOnly={readOnly}
            onChange={(next) => setDraftMd(next)}
            extraExtensions={wikilinkExtensionList}
            className="w-full h-full min-h-[300px] border rounded font-sans text-sm overflow-hidden"
          />
        )}
        {mode === "source" && (
          <textarea
            data-testid="markdown-editor-textarea-source"
            className="w-full h-full min-h-[300px] border rounded p-2 font-mono text-xs"
            value={liveText}
            disabled={readOnly}
            onChange={(e) => setDraftMd(e.target.value)}
          />
        )}
      </div>
    </section>
  );
}

function ModeButton({
  current,
  target,
  setMode,
  disabled,
}: {
  current: Mode;
  target: Mode;
  setMode: (m: Mode) => void;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-testid={`markdown-editor-mode-${target}`}
      data-mode-current={current === target ? "true" : "false"}
      disabled={disabled}
      onClick={() => setMode(target)}
      className={`px-2 py-1 rounded border ${
        current === target ? "bg-blue-50 border-blue-300" : ""
      } disabled:opacity-50`}
    >
      {target}
    </button>
  );
}
