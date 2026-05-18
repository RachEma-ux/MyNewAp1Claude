/**
 * VaultFsSyncPanel — Track A — A7.
 *
 * Per-vault FS-sync settings surface. Three states + a forcing-
 * function backfill button:
 *
 *   1. **Disabled** (fs_sync_path null) — path input + Enable button.
 *      Enable submits the path through `setFsSyncPath`; success
 *      transitions to Enabled state.
 *   2. **Enabled** (fs_sync_path set, watcher running) — shows the
 *      current path + a `Disable sync` button (clears the path) +
 *      `Trigger backfill` (manual one-shot export of every note).
 *   3. **Stopped** (fs_sync_path set, watcher NOT running) — same
 *      as Enabled but with a banner "Watcher not running for this
 *      vault on this region"; the Enable button restarts.
 *
 * Errors from setFsSyncPath surface inline (path-validation
 * failures from `assertVaultRootIsConfigurable` are operator-
 * friendly).
 *
 * Designed to be embedded in any per-vault settings menu — passed
 * the vaultId as a prop. VaultExplorer's future "..." menu will
 * mount it.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import React, { useState } from "react";

import { trpc } from "../../../../lib/trpc";

export interface VaultFsSyncPanelProps {
  readonly vaultId: number;
  /** Optional callback fired after a successful sync state change. */
  readonly onChange?: () => void;
}

export default function VaultFsSyncPanel({
  vaultId,
  onChange,
}: VaultFsSyncPanelProps): React.ReactElement {
  const statusQuery = trpc.agentStudio.vault.getFsSyncStatus.useQuery({
    vaultId,
  });
  const setMutation = trpc.agentStudio.vault.setFsSyncPath.useMutation();
  const backfillMutation =
    trpc.agentStudio.vault.triggerInitialBackfill.useMutation();
  const utils = trpc.useUtils();

  const [pathDraft, setPathDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<
    { written: number; skipped: number; errors: number } | null
  >(null);

  if (statusQuery.isLoading) {
    return (
      <section
        className="border rounded p-3"
        data-testid="vault-fs-sync-panel"
        data-state="loading"
      >
        <h3 className="font-medium text-sm">FS sync</h3>
        <p className="text-xs text-gray-500 mt-1">Loading status…</p>
      </section>
    );
  }
  if (statusQuery.error) {
    return (
      <section
        className="border rounded p-3"
        data-testid="vault-fs-sync-panel"
        data-state="error"
      >
        <h3 className="font-medium text-sm">FS sync</h3>
        <p className="text-xs text-red-600 mt-1">
          Status lookup failed: {statusQuery.error.message}
        </p>
      </section>
    );
  }

  const status = statusQuery.data;
  const enabled = status?.enabled ?? false;
  const watcherRunning = status?.watcherRunning ?? false;
  const stopped = enabled && !watcherRunning;

  async function handleEnable(): Promise<void> {
    setError(null);
    const path = pathDraft.trim();
    if (path.length === 0) {
      setError("Path is required");
      return;
    }
    try {
      await setMutation.mutateAsync({ vaultId, path });
      setPathDraft("");
      await utils.agentStudio.vault.getFsSyncStatus.invalidate({ vaultId });
      onChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDisable(): Promise<void> {
    setError(null);
    try {
      await setMutation.mutateAsync({ vaultId, path: null });
      await utils.agentStudio.vault.getFsSyncStatus.invalidate({ vaultId });
      onChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBackfill(): Promise<void> {
    setError(null);
    setBackfillResult(null);
    try {
      const r = await backfillMutation.mutateAsync({ vaultId });
      setBackfillResult({
        written: r.written,
        skipped: r.skippedEcho,
        errors: r.errors.length,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section
      className="border rounded p-3 space-y-2"
      data-testid="vault-fs-sync-panel"
      data-state={enabled ? (stopped ? "stopped" : "enabled") : "disabled"}
    >
      <header className="flex items-center justify-between">
        <h3 className="font-medium text-sm">FS sync</h3>
        <StatusBadge enabled={enabled} watcherRunning={watcherRunning} />
      </header>

      {stopped && (
        <p
          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
          data-testid="vault-fs-sync-stopped-banner"
        >
          Watcher not running for this vault on this region. Re-enable
          to restart it.
        </p>
      )}

      {!enabled && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            placeholder="/absolute/path/to/vault"
            data-testid="vault-fs-sync-path-input"
            className="flex-1 border rounded px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={setMutation.isPending}
            data-testid="vault-fs-sync-enable"
            onClick={() => void handleEnable()}
            className="px-2 py-1 rounded border text-xs disabled:opacity-50"
          >
            {setMutation.isPending ? "Enabling…" : "Enable sync"}
          </button>
        </div>
      )}

      {enabled && (
        <div className="space-y-1">
          <p
            className="text-xs font-mono text-gray-700 break-all"
            data-testid="vault-fs-sync-current-path"
          >
            {status?.fsSyncPath}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={setMutation.isPending}
              data-testid="vault-fs-sync-disable"
              onClick={() => void handleDisable()}
              className="px-2 py-1 rounded border text-xs disabled:opacity-50"
            >
              Disable sync
            </button>
            <button
              type="button"
              disabled={backfillMutation.isPending}
              data-testid="vault-fs-sync-backfill"
              onClick={() => void handleBackfill()}
              title="One-shot export of every note in this vault to disk. Idempotent."
              className="px-2 py-1 rounded border text-xs disabled:opacity-50"
            >
              {backfillMutation.isPending ? "Running…" : "Trigger backfill"}
            </button>
          </div>
        </div>
      )}

      {backfillResult && (
        <p
          className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1"
          data-testid="vault-fs-sync-backfill-result"
        >
          Backfill: {backfillResult.written} written, {backfillResult.skipped}{" "}
          skipped (echo), {backfillResult.errors} errors.
        </p>
      )}

      {error && (
        <p
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1"
          data-testid="vault-fs-sync-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function StatusBadge({
  enabled,
  watcherRunning,
}: {
  enabled: boolean;
  watcherRunning: boolean;
}): React.ReactElement {
  if (!enabled) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600"
        data-testid="vault-fs-sync-badge"
        data-status="disabled"
      >
        disabled
      </span>
    );
  }
  if (!watcherRunning) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700"
        data-testid="vault-fs-sync-badge"
        data-status="stopped"
      >
        watcher stopped
      </span>
    );
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700"
      data-testid="vault-fs-sync-badge"
      data-status="enabled"
    >
      synced
    </span>
  );
}
