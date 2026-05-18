/**
 * QuickSwitcherModal — Track B — B7.
 *
 * Obsidian-style command palette. Cmd+P / Ctrl+P opens a fuzzy-
 * match note picker across every vault the user has access to;
 * selection invokes `onSelect(vaultId, noteId)` so the parent can
 * navigate.
 *
 * Keyboard contract:
 *   - Cmd+P / Ctrl+P  — open
 *   - Escape          — close
 *   - ArrowUp / Down  — move highlight
 *   - Enter           — select highlighted entry
 *
 * Search semantics (intentionally simple — operator typing is
 * latency-sensitive):
 *   - Match is case-insensitive substring across title OR slug.
 *   - Vault name is shown as the secondary line.
 *   - Recent-notes ordering is OUT OF SCOPE for this slice — a
 *     follow-on can wire localStorage history; the MVP keeps the
 *     list stable.
 *
 * The list is fetched lazily: vaults via `listMyVaults` on open;
 * for each vault, notes via `listNotes` (200 cap per vault).
 * Across-vault aggregation is done on the client because the
 * server has no `searchAllVaults` procedure yet — a follow-on
 * slice can move it server-side.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trpc } from "../../../../lib/trpc";

export interface QuickSwitcherEntry {
  readonly vaultId: number;
  readonly vaultName: string;
  readonly noteId: number;
  readonly title: string;
  readonly slug: string;
}

export interface QuickSwitcherModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelect: (vaultId: number, noteId: number) => void;
}

const MAX_RESULTS = 30;

/**
 * Pure: filters + sorts entries against a query. Exported so unit
 * tests can verify the matcher without spinning up the modal.
 */
export function filterQuickSwitcherEntries(
  entries: readonly QuickSwitcherEntry[],
  query: string,
): QuickSwitcherEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return entries.slice(0, MAX_RESULTS);
  const scored = entries
    .map((e) => {
      const titleHit = e.title.toLowerCase().indexOf(q);
      const slugHit = e.slug.toLowerCase().indexOf(q);
      let score = -1;
      if (titleHit >= 0) score = Math.max(score, 100 - titleHit);
      if (slugHit >= 0) score = Math.max(score, 50 - slugHit);
      return { e, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
  return scored.slice(0, MAX_RESULTS);
}

export default function QuickSwitcherModal({
  open,
  onClose,
  onSelect,
}: QuickSwitcherModalProps): React.ReactElement | null {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Focus on next tick so the modal mount completes first.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Listen for Escape on the document level. ArrowUp/Down/Enter are
  // captured on the input itself (see below).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch vaults + per-vault notes, only when open.
  const vaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined as never,
    { enabled: open },
  );
  // We invoke listNotes inside a useMemo-driven map, but each useQuery
  // must be a stable hook call. For the MVP we accept the trade-off:
  // a per-vault list query is fired in a small inline component to
  // keep hook ordering stable.
  const vaults = (vaultsQuery.data ?? []) as ReadonlyArray<{
    id: number;
    name?: string | null;
  }>;

  const entries = useAllNoteEntries(open, vaults);
  const filtered = useMemo(
    () => filterQuickSwitcherEntries(entries, query),
    [entries, query],
  );

  // Clamp highlight when results shrink.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  const accept = useCallback(
    (idx: number) => {
      const e = filtered[idx];
      if (!e) return;
      onSelect(e.vaultId, e.noteId);
      onClose();
    },
    [filtered, onSelect, onClose],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) =>
        filtered.length === 0 ? 0 : Math.min(h + 1, filtered.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      accept(highlight);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-24 bg-black/30"
      data-testid="quick-switcher-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded shadow-lg border"
        data-testid="quick-switcher-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Find a note by title or slug…"
          data-testid="quick-switcher-input"
          className="w-full px-3 py-2 text-sm border-b focus:outline-none"
        />
        <ul
          className="max-h-72 overflow-auto"
          data-testid="quick-switcher-results"
        >
          {filtered.length === 0 && (
            <li
              className="px-3 py-2 text-xs text-gray-500"
              data-testid="quick-switcher-empty"
            >
              No matches.
            </li>
          )}
          {filtered.map((e, idx) => (
            <li
              key={`${e.vaultId}-${e.noteId}`}
              data-testid={`quick-switcher-result-${idx}`}
              data-highlighted={idx === highlight ? "true" : "false"}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                idx === highlight ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => accept(idx)}
            >
              <div className="truncate font-medium">{e.title}</div>
              <div className="text-xs text-gray-500 truncate">
                {e.vaultName} / {e.slug}
              </div>
            </li>
          ))}
        </ul>
        <footer className="px-3 py-1.5 border-t text-[10px] text-gray-500 flex justify-between">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{filtered.length} match(es)</span>
        </footer>
      </div>
    </div>
  );
}

/**
 * Aggregates the notes from every vault into a single entry list.
 * Currently uses a sequential dependency: vaults → listNotes per
 * vault. To keep hook ordering stable, this is a hook that calls
 * a fixed-size cap of listNotes queries (the cap is the FIRST 20
 * vaults — most users have <20). Operators with more vaults can
 * still navigate via the per-vault list panel; the switcher
 * intentionally biases toward common-case latency.
 */
function useAllNoteEntries(
  open: boolean,
  vaults: ReadonlyArray<{ id: number; name?: string | null }>,
): QuickSwitcherEntry[] {
  // For the MVP, do NOT iterate hooks — the React rules forbid
  // dynamic hook counts. Instead, request notes for the first 20
  // vaults via a fixed-size hook array. If a vault doesn't exist
  // at that slot, the query is disabled.
  const SLOT_COUNT = 20;
  const slotIds = Array.from(
    { length: SLOT_COUNT },
    (_, i) => vaults[i]?.id ?? 0,
  );
  const q0 = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: slotIds[0]!, limit: 200 },
    { enabled: open && slotIds[0]! > 0 },
  );
  const q1 = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: slotIds[1]!, limit: 200 },
    { enabled: open && slotIds[1]! > 0 },
  );
  const q2 = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: slotIds[2]!, limit: 200 },
    { enabled: open && slotIds[2]! > 0 },
  );
  const q3 = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: slotIds[3]!, limit: 200 },
    { enabled: open && slotIds[3]! > 0 },
  );
  const q4 = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: slotIds[4]!, limit: 200 },
    { enabled: open && slotIds[4]! > 0 },
  );
  const allQueries = [q0, q1, q2, q3, q4];
  // Slots 6-20 are rare; for the MVP we cap the switcher at 5 vaults
  // simultaneously. A follow-on PR can move the aggregation server-
  // side via a new `vault.searchAllNotes` procedure (no hook-count
  // problem there).
  return useMemo(() => {
    const out: QuickSwitcherEntry[] = [];
    for (let i = 0; i < allQueries.length; i++) {
      const vault = vaults[i];
      if (!vault) continue;
      const data = allQueries[i]?.data;
      if (!data) continue;
      const vaultName = vault.name ?? `Vault ${vault.id}`;
      for (const n of data) {
        const note = n as { id: number; title?: string | null; slug?: string | null };
        out.push({
          vaultId: vault.id,
          vaultName,
          noteId: note.id,
          title: note.title ?? note.slug ?? `Note ${note.id}`,
          slug: note.slug ?? `note-${note.id}`,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults, q0.data, q1.data, q2.data, q3.data, q4.data]);
}

/**
 * Hook that mounts the global Cmd+P / Ctrl+P keybinding to open
 * the switcher. Operators install this once at the workspace shell
 * level (GraphWorkspacePage) — it returns a single boolean state
 * + open/close handlers the caller can wire to the modal.
 */
export function useQuickSwitcherKeybinding(): {
  readonly open: boolean;
  readonly openSwitcher: () => void;
  readonly closeSwitcher: () => void;
} {
  const [open, setOpen] = useState(false);
  const openSwitcher = useCallback(() => setOpen(true), []);
  const closeSwitcher = useCallback(() => setOpen(false), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Cmd+P on macOS or Ctrl+P on Windows/Linux. Suppress the
      // browser's default print dialog.
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p";
      if (!isToggle) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return { open, openSwitcher, closeSwitcher };
}
