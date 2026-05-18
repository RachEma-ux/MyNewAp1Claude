/**
 * CodeMirrorMdEditor — Track B — B2.
 *
 * Thin React wrapper around CodeMirror 6 configured for markdown
 * editing. Replaces the plain `<textarea>` in MarkdownEditorPane's
 * `edit` mode (source mode keeps the textarea for power users who
 * want a raw view).
 *
 * Extensions:
 *  - markdown() language (commonmark dialect)
 *  - history() for undo/redo
 *  - keymap (default + history)
 *  - drawSelection / cursor (parity with Obsidian's selection feel)
 *  - lineNumbers — INTENTIONALLY OFF for prose editing (Obsidian
 *    doesn't show line numbers in markdown view)
 *
 * Live preview rendering (inline formatting) ships in a follow-on
 * slice — this PR establishes the editor surface + onChange contract
 * so subsequent slices (wikilink autocomplete, tag autocomplete,
 * properties panel) can hook into the same `EditorView` instance.
 *
 * Cleanup is critical: each EditorView attaches DOM nodes + event
 * listeners that leak if not `.destroy()`ed in the effect cleanup.
 *
 * ADR: Track B — Obsidian-style editor parity per
 *      ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import React, { useEffect, useRef } from "react";

export interface CodeMirrorMdEditorProps {
  /** Current value (controlled). */
  readonly value: string;
  /** Called with the new value when the editor's content changes. */
  readonly onChange: (next: string) => void;
  /** Disable input + focus highlighting when true. */
  readonly readOnly?: boolean;
  /** Test hook + accessibility label. */
  readonly testId?: string;
  /** Optional className for layout (the inner CM root expands to fill). */
  readonly className?: string;
  /**
   * Track B follow-on slices (B3 wikilink, B4 tag, B6 embed) layer
   * extra extensions on top of the base set. The editor mounts them
   * once at construction time; reconfiguring after mount would lose
   * cursor + history, so pass a stable array (or memoize).
   */
  readonly extraExtensions?: readonly import("@codemirror/state").Extension[];
}

export default function CodeMirrorMdEditor({
  value,
  onChange,
  readOnly = false,
  testId = "codemirror-md-editor",
  className,
  extraExtensions,
}: CodeMirrorMdEditorProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Compartment for dynamic readOnly reconfiguration without
  // recreating the entire view (which would lose cursor + history).
  const readOnlyCompartment = useRef(new Compartment());
  // Hold the latest onChange in a ref so the update-listener doesn't
  // need to be torn down on every parent re-render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Construct the view once per mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        markdown(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          onChangeRef.current(next);
        }),
        ...(extraExtensions ?? []),
      ],
    });
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally empty — recreate on readOnly change is handled
    // by the separate effect below; recreating on every value change
    // would lose cursor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep doc in sync with the controlled `value` prop without
  // wiping cursor state. Only dispatch when the prop differs from
  // the current doc (avoid feedback loops with our own onChange).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  // React to readOnly toggles by reconfiguring the Compartment.
  // Avoids tearing down the view (which would lose cursor + history).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      data-read-only={readOnly ? "true" : "false"}
      className={
        className ??
        "w-full h-full min-h-[300px] border rounded font-sans text-sm overflow-hidden"
      }
    />
  );
}
