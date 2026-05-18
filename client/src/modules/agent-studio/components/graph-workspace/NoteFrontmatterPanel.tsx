/**
 * NoteFrontmatterPanel — Track B — B5.
 *
 * Obsidian-style "Properties" panel rendered above the editor body.
 * Reads the parsed frontmatter from the current note's contentMd
 * via the shared `parseMarkdownBlob` helper; edits flow back as a
 * re-rendered contentMd through the same `onChange` channel the
 * editor uses, so auto-save (B1) catches them unchanged.
 *
 * Type inference per key (single-row UI per value type):
 *   - boolean → toggle
 *   - number  → numeric input
 *   - string  → text input
 *   - array   → comma-separated text input (parsed back on save)
 *   - object  → JSON textarea (advanced)
 *   - null    → "no value" badge with a "Set string" affordance
 *
 * Add / remove keys via the "+ Add property" affordance and the
 * per-row trash button.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import React, { useCallback, useMemo, useState } from "react";

import {
  parseMarkdownBlob,
  renderNoteAsMarkdown,
} from "@shared/vault-markdown-profile";

export interface NoteFrontmatterPanelProps {
  /**
   * Current full Markdown blob (frontmatter + body). Panel parses
   * the frontmatter from this; on edit it re-renders the new
   * frontmatter on top of the preserved body and calls onChange
   * with the new full blob.
   */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly readOnly?: boolean;
  /** Whether the panel renders expanded by default. */
  readonly defaultOpen?: boolean;
}

type PrimitiveType = "string" | "number" | "boolean" | "array" | "object" | "null";

function inferType(v: unknown): PrimitiveType {
  if (v === null) return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "array";
  return "object";
}

function parseArrayInput(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export default function NoteFrontmatterPanel({
  value,
  onChange,
  readOnly = false,
  defaultOpen = true,
}: NoteFrontmatterPanelProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  // Local newKey input for the "+ Add property" flow.
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Parse on every render — pure, cheap.
  const { frontmatter, contentMd } = useMemo(
    () => parseMarkdownBlob(value),
    [value],
  );
  const keys = Object.keys(frontmatter);

  const commit = useCallback(
    (nextFrontmatter: Record<string, unknown>) => {
      const nextMd = renderNoteAsMarkdown({
        frontmatter: nextFrontmatter,
        contentMd,
      });
      onChange(nextMd);
    },
    [contentMd, onChange],
  );

  const setKeyValue = useCallback(
    (key: string, nextValue: unknown) => {
      const next = { ...frontmatter, [key]: nextValue };
      commit(next);
    },
    [frontmatter, commit],
  );

  const deleteKey = useCallback(
    (key: string) => {
      const next = { ...frontmatter };
      delete next[key];
      commit(next);
    },
    [frontmatter, commit],
  );

  const addKey = useCallback(() => {
    setError(null);
    const k = newKey.trim();
    if (k.length === 0) {
      setError("Key is required");
      return;
    }
    if (k in frontmatter) {
      setError("Key already exists");
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)) {
      setError("Key must start with a letter/underscore (no spaces)");
      return;
    }
    commit({ ...frontmatter, [k]: "" });
    setNewKey("");
  }, [newKey, frontmatter, commit]);

  return (
    <section
      className="border rounded mb-2"
      data-testid="note-frontmatter-panel"
      data-state={open ? "open" : "closed"}
      data-key-count={keys.length}
    >
      <header className="flex items-center justify-between px-3 py-1.5 border-b bg-gray-50/30">
        <button
          type="button"
          className="text-xs font-medium text-gray-700"
          data-testid="note-frontmatter-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"} Properties{" "}
          <span className="text-gray-400">({keys.length})</span>
        </button>
      </header>

      {open && (
        <div className="p-3 space-y-1.5">
          {keys.length === 0 && (
            <p
              className="text-xs text-gray-500"
              data-testid="note-frontmatter-empty"
            >
              No properties on this note. Add one below.
            </p>
          )}
          {keys.map((k) => (
            <PropertyRow
              key={k}
              propKey={k}
              propValue={frontmatter[k]}
              type={inferType(frontmatter[k])}
              readOnly={readOnly}
              onValueChange={(next) => setKeyValue(k, next)}
              onDelete={() => deleteKey(k)}
            />
          ))}

          {!readOnly && (
            <div
              className="flex items-center gap-2 pt-2 border-t mt-2"
              data-testid="note-frontmatter-add-row"
            >
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Property name"
                data-testid="note-frontmatter-new-key"
                className="flex-1 border rounded px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={newKey.trim().length === 0}
                data-testid="note-frontmatter-add"
                onClick={addKey}
                className="text-xs px-2 py-1 rounded border disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          )}

          {error && (
            <p
              className="text-xs text-red-600"
              data-testid="note-frontmatter-error"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface PropertyRowProps {
  readonly propKey: string;
  readonly propValue: unknown;
  readonly type: PrimitiveType;
  readonly readOnly: boolean;
  readonly onValueChange: (next: unknown) => void;
  readonly onDelete: () => void;
}

function PropertyRow({
  propKey,
  propValue,
  type,
  readOnly,
  onValueChange,
  onDelete,
}: PropertyRowProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 text-xs"
      data-testid={`note-frontmatter-row-${propKey}`}
      data-prop-type={type}
    >
      <span className="w-32 truncate font-mono text-gray-600" title={propKey}>
        {propKey}
      </span>
      <div className="flex-1">
        <PropertyValueEditor
          type={type}
          value={propValue}
          readOnly={readOnly}
          onChange={onValueChange}
        />
      </div>
      {!readOnly && (
        <button
          type="button"
          data-testid={`note-frontmatter-delete-${propKey}`}
          onClick={onDelete}
          title="Delete property"
          className="text-red-600 hover:text-red-800 px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface PropertyValueEditorProps {
  readonly type: PrimitiveType;
  readonly value: unknown;
  readonly readOnly: boolean;
  readonly onChange: (next: unknown) => void;
}

function PropertyValueEditor({
  type,
  value,
  readOnly,
  onChange,
}: PropertyValueEditorProps): React.ReactElement {
  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
        data-testid="note-frontmatter-value-boolean"
      />
    );
  }
  if (type === "number") {
    return (
      <input
        type="number"
        value={(value as number) ?? 0}
        disabled={readOnly}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid="note-frontmatter-value-number"
        className="w-full border rounded px-2 py-0.5"
      />
    );
  }
  if (type === "array") {
    const arr = (value as unknown[]).map(String);
    return (
      <input
        type="text"
        value={arr.join(", ")}
        disabled={readOnly}
        onChange={(e) => onChange(parseArrayInput(e.target.value))}
        data-testid="note-frontmatter-value-array"
        placeholder="comma, separated, values"
        className="w-full border rounded px-2 py-0.5 font-mono"
      />
    );
  }
  if (type === "object") {
    return (
      <textarea
        value={JSON.stringify(value, null, 2)}
        disabled={readOnly}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Swallow invalid JSON in-flight; the operator's typing.
            // The DOM textarea keeps its value, but the controlled
            // input pattern means we don't visibly reject until
            // the JSON parses again.
          }
        }}
        data-testid="note-frontmatter-value-object"
        className="w-full border rounded px-2 py-0.5 font-mono text-[10px]"
        rows={3}
      />
    );
  }
  if (type === "null") {
    return (
      <button
        type="button"
        data-testid="note-frontmatter-value-null"
        onClick={() => onChange("")}
        disabled={readOnly}
        className="text-gray-500 italic hover:underline"
      >
        (null) — click to set string
      </button>
    );
  }
  // string
  return (
    <input
      type="text"
      value={(value as string) ?? ""}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
      data-testid="note-frontmatter-value-string"
      className="w-full border rounded px-2 py-0.5"
    />
  );
}
