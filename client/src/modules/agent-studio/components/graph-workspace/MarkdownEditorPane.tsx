/**
 * MarkdownEditorPane — Product Work items 14 + 16.
 *
 * Three-mode Markdown surface: read / edit / source.
 *
 * Reuse-first:
 *   - Read mode: AppStreamdown (existing react-markdown renderer)
 *   - Edit mode: native textarea (no new npm dep) with dirty state
 *   - Source mode: monospaced raw Markdown view (also via textarea)
 *
 * Save path:
 *   - trpc.agentStudio.vault.updateNote (existing CRDT-aware procedure)
 *   - Conflict detection comes back as `{conflict: true, latestVersion}`
 *
 * Read-only:
 *   - Driven by the `readOnly` prop; UI disables editing affordances
 *     when true. The server enforces the same rule independently.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AppStreamdown } from "../../../../components/markdown/AppStreamdown";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer from "./WorkspaceStateLayer";

type Mode = "read" | "edit" | "source";

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

  if (noteQuery.isLoading) {
    return (
      <div className="flex-1 p-3" data-testid="markdown-editor-pane">
        <WorkspaceStateLayer state="loading" />
      </div>
    );
  }
  if (noteQuery.error) {
    return (
      <div className="flex-1 p-3" data-testid="markdown-editor-pane">
        <WorkspaceStateLayer
          state="permission_denied"
          rawErrorForDevtools={noteQuery.error.message}
        />
      </div>
    );
  }

  async function handleSave(): Promise<void> {
    if (readOnly || !dirty || draftMd === null) return;
    const expectedVersion = noteQuery.data?.latestVersion?.version ?? null;
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
      // operator can retry.
    }
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
          {dirty && (
            <span
              className="text-amber-600 text-xs"
              data-testid="markdown-editor-dirty-flag"
            >
              ● unsaved
            </span>
          )}
          {savedAt !== null && !dirty && (
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
            className="ml-2 px-2 py-1 rounded border text-xs disabled:opacity-50"
          >
            Save
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
          <textarea
            data-testid="markdown-editor-textarea-edit"
            className="w-full h-full min-h-[300px] border rounded p-2 font-sans text-sm"
            value={liveText}
            disabled={readOnly}
            onChange={(e) => setDraftMd(e.target.value)}
            spellCheck
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
