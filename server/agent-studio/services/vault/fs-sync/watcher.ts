/**
 * Vault FS-sync — chokidar watcher.
 *
 * Track A — A4. Subscribes to `{vaultRoot}/**\/*.md` and emits
 * debounced add/change/unlink events to a caller-supplied handler.
 * The handler (A6 — post-commit DB integration) decides whether to
 * upsert a new note version, soft-delete a note, etc.
 *
 * The watcher itself is pure-FS — it does NOT touch the DB and does
 * NOT consult `ags_notes.fs_sync_last_hash`. Echo prevention lives
 * one layer up: the handler reads the file via `readMarkdownFile`
 * with the stored `lastHash` and short-circuits on the `skipped_echo`
 * branch.
 *
 * Lifecycle:
 *  - `startVaultWatcher(opts)` returns a `WatcherHandle` with a
 *    `close()` method.
 *  - `WatcherManager` keeps a Map<vaultId, WatcherHandle> for the
 *    server process; `getOrStart(vaultId, root)` (re)creates as the
 *    vault's `fs_sync_path` changes; `closeAll()` is called from the
 *    server shutdown hook.
 *
 * Stability:
 *  - `awaitWriteFinish` (chokidar built-in) coalesces multi-write
 *    operations so partial writes don't fire events. Combined with
 *    the writer's atomic `.tmp` → rename pattern this means the
 *    handler only ever sees fully-written files.
 *  - `.tmp` files are excluded from the watch glob.
 *  - `.fs-sync.lock` is excluded.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { join } from "node:path";

import { isStagingFile, TMP_SUFFIX } from "./writer.js";

/** Per-file event payload delivered to the caller's handler. */
export interface FsSyncWatcherEvent {
  readonly vaultId: number;
  readonly vaultRoot: string;
  readonly absPath: string;
  readonly kind: "add" | "change" | "unlink";
}

/** Opaque handle the caller uses to stop a watcher. */
export interface WatcherHandle {
  readonly vaultId: number;
  readonly vaultRoot: string;
  close(): Promise<void>;
}

export interface StartVaultWatcherOptions {
  readonly vaultId: number;
  readonly vaultRoot: string;
  /**
   * Handler invoked once per debounced file event. The handler is
   * responsible for: (a) looking up the matching note row (or
   * deciding it's a new note for `add`), (b) calling
   * `readMarkdownFile` with the stored `lastHash`, (c) persisting
   * the resulting note version + updated hash.
   *
   * The watcher does not await the handler — errors thrown from it
   * are logged via the optional `onError` callback but do not stop
   * the watcher.
   */
  readonly onEvent: (event: FsSyncWatcherEvent) => void | Promise<void>;
  /** Optional error sink. Defaults to console.error. */
  readonly onError?: (e: unknown, context: string) => void;
  /**
   * Optional debounce window (ms). Chokidar's `awaitWriteFinish`
   * already coalesces partial writes; this layer adds a final
   * 250 ms quiet period before delivering events to handle the
   * editor-save-then-immediately-resave shape. Tests may set this
   * to 0 to bypass debouncing.
   */
  readonly debounceMs?: number;
}

/**
 * Starts a chokidar watcher for `vaultRoot`. Returns a handle the
 * caller can close on shutdown or when the vault's `fs_sync_path`
 * changes.
 */
export function startVaultWatcher(
  options: StartVaultWatcherOptions,
): WatcherHandle {
  const {
    vaultId,
    vaultRoot,
    onEvent,
    onError = (e, ctx) =>
      console.error(`[fs-sync watcher ${ctx}]`, e),
    debounceMs = 250,
  } = options;

  const watcher: FSWatcher = chokidarWatch(vaultRoot, {
    ignored: (filePath) => {
      // chokidar 5 passes the full path; ignore .tmp staging files,
      // the per-vault lock file, dotfiles (.obsidian/, .git/, …), and
      // any non-.md file.
      if (isStagingFile(filePath)) return true;
      if (filePath.endsWith(`${TMP_SUFFIX}`)) return true;
      if (filePath.endsWith(".fs-sync.lock")) return true;
      const baseSegment = filePath.split("/").pop() ?? "";
      if (baseSegment.startsWith(".")) return true;
      // Allow directories through (they don't match the .md test)
      // by treating non-.md, non-directory-looking paths as ignored.
      // The chokidar runtime calls this with directories during
      // recursion; non-.md files are filtered here, non-.md
      // directories (e.g. _attachments/) get traversed only if they
      // contain .md descendants, which is fine.
      if (baseSegment.includes(".") && !baseSegment.endsWith(".md")) return true;
      return false;
    },
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  // Per-path debounce buckets so a rapid-fire save+resave on the
  // same file delivers just one event.
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const fire = (kind: FsSyncWatcherEvent["kind"], absPath: string) => {
    if (debounceMs <= 0) {
      void Promise.resolve(
        onEvent({ vaultId, vaultRoot, absPath, kind }),
      ).catch((e) => onError(e, `onEvent ${kind} ${absPath}`));
      return;
    }
    const prev = debounceTimers.get(absPath);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      debounceTimers.delete(absPath);
      void Promise.resolve(
        onEvent({ vaultId, vaultRoot, absPath, kind }),
      ).catch((e) => onError(e, `onEvent ${kind} ${absPath}`));
    }, debounceMs);
    debounceTimers.set(absPath, handle);
  };

  watcher.on("add", (p) => fire("add", p));
  watcher.on("change", (p) => fire("change", p));
  watcher.on("unlink", (p) => fire("unlink", p));
  watcher.on("error", (e) => onError(e, "chokidar"));

  return {
    vaultId,
    vaultRoot,
    async close(): Promise<void> {
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
      await watcher.close();
    },
  };
}

/**
 * Process-wide registry of running watchers, keyed by vaultId. The
 * tRPC layer (A5) consults this to start/stop/restart on
 * `fs_sync_path` config changes; the post-commit hook layer (A6)
 * does NOT consult it (it just emits DB→FS writes through the
 * pure-FS writer).
 */
export class WatcherManager {
  private readonly handles = new Map<number, WatcherHandle>();

  /**
   * Returns the existing handle for the vault if one is running,
   * otherwise starts a new one. The caller passes the current
   * `vaultRoot`; if the active handle was started with a different
   * root, the old one is closed first.
   */
  async getOrStart(
    options: StartVaultWatcherOptions,
  ): Promise<WatcherHandle> {
    const existing = this.handles.get(options.vaultId);
    if (existing && existing.vaultRoot === options.vaultRoot) {
      return existing;
    }
    if (existing) {
      await existing.close();
      this.handles.delete(options.vaultId);
    }
    const handle = startVaultWatcher(options);
    this.handles.set(options.vaultId, handle);
    return handle;
  }

  /** Stops the watcher for `vaultId`, no-op if none. */
  async stop(vaultId: number): Promise<void> {
    const h = this.handles.get(vaultId);
    if (!h) return;
    await h.close();
    this.handles.delete(vaultId);
  }

  /** Convenience: stops all watchers (server-shutdown hook). */
  async closeAll(): Promise<void> {
    const all = Array.from(this.handles.values());
    this.handles.clear();
    await Promise.all(all.map((h) => h.close()));
  }

  /** For tests + status surface. */
  has(vaultId: number): boolean {
    return this.handles.has(vaultId);
  }

  /** For tests + status surface. */
  size(): number {
    return this.handles.size;
  }

  /** For tests + getFsSyncStatus tRPC. */
  vaultRootFor(vaultId: number): string | null {
    return this.handles.get(vaultId)?.vaultRoot ?? null;
  }
}

/**
 * Process-singleton manager. Subsequent slices (A5 tRPC, A6 post-
 * commit hooks) import this same instance so all parts of the
 * server see the same set of running watchers.
 */
export const defaultWatcherManager = new WatcherManager();

/** Helper for tests: build a {vaultRoot}/note path. */
export function notePathUnderVault(
  vaultRoot: string,
  relativeNotePath: string,
): string {
  return join(vaultRoot, relativeNotePath);
}
