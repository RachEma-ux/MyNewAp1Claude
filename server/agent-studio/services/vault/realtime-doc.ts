/**
 * Vault — Realtime document service (V2 Phase CRDT-β first slice).
 *
 * CRDT-α (#755) shipped presence + idle TTL. CRDT-β closes the
 * "document layer" half of the realtime collab phase:
 *
 *   - `RealtimeDocBackend` interface — pinned contract that the
 *     production Yjs adapter (CRDT-γ) + the test in-memory adapter
 *     both implement. Captures the minimum surface a WebSocket
 *     transport needs: encode a snapshot, apply a remote update,
 *     extract the canonical text for save-time persistence, merge a
 *     batch of updates server-side.
 *   - `InMemoryRealtimeDocBackend` — simple-text-buffer reference
 *     implementation. Used by unit tests (zero dependencies). Not
 *     CRDT-correct (last-writer-wins on concurrent edits) but
 *     contract-compliant.
 *   - `RealtimeDocSession` — service-layer wrapper that holds one
 *     backend instance per (vaultId, noteId) tuple, exposing the
 *     transport-friendly methods (handleUpdate, snapshot, save).
 *   - `getCanonicalContentForSave()` — pure helper that callers use
 *     at the save boundary to extract the text the Vault repository
 *     should persist into `agsNoteVersions`.
 *
 * CRDT-γ will add:
 *   - `YjsRealtimeDocBackend` (depends on `yjs` package — lands with
 *     this PR's adapter).
 *   - WebSocket transport (`server/agent-studio/services/vault/realtime-transport.ts`)
 *     binding the session to a `ws` server route.
 *   - IndexedDB-backed local persistence (browser side).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Postgres = source of truth. The CRDT layer is presence +
 *     transient + cursor; canonical writes still flow through the
 *     Vault repository at save boundaries (`agsNoteVersions` row).
 *   - No graph mutation. No `credential-resolver` import. No raw
 *     `process.env.*_API_KEY`. No `dispatchMcpToolCall` import.
 *     Source-scan tested.
 */

// ============================================================================
// Backend interface
// ============================================================================

/**
 * Closed key for the canonical text field a backend exposes. The
 * Yjs adapter wraps a `Y.Text` keyed by this name; the in-memory
 * adapter holds a single string under the same key.
 */
export const REALTIME_DOC_TEXT_KEY = "content" as const;

export interface RealtimeDocBackend {
  /** Encode the current document state to a Uint8Array snapshot
   *  suitable for transport to a peer. */
  encodeSnapshot(): Uint8Array;
  /** Apply a remote update (typically received over WebSocket) to
   *  this document's state. */
  applyUpdate(update: Uint8Array): void;
  /** Extract the canonical text for save-time persistence. */
  getText(key?: string): string;
  /** Replace the canonical text. The backend may interpret this as
   *  a single-write transaction; the in-memory adapter overwrites,
   *  the Yjs adapter replaces the `Y.Text` content. */
  setText(text: string, key?: string): void;
  /** Number of pending updates the backend has merged since last
   *  snapshot. Used by the transport to decide when to broadcast. */
  pendingUpdateCount(): number;
}

// ============================================================================
// In-memory reference implementation (test default + non-CRDT fallback)
// ============================================================================

/**
 * Simple-text-buffer backend. Not CRDT-correct (last-writer-wins on
 * concurrent edits), but implements every contract method so unit
 * tests can verify the session/transport wiring without pulling in
 * a real CRDT library.
 *
 * Snapshots are JSON-encoded `{ text: string }`. Updates are
 * JSON-encoded `{ text: string }` and replace the buffer entirely.
 * Production callers use the Yjs adapter (CRDT-γ).
 */
export class InMemoryRealtimeDocBackend implements RealtimeDocBackend {
  private buffer = new Map<string, string>();
  private pending = 0;

  encodeSnapshot(): Uint8Array {
    const obj = Object.fromEntries(this.buffer.entries());
    return new TextEncoder().encode(JSON.stringify(obj));
  }

  applyUpdate(update: Uint8Array): void {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(update)) as Record<
        string,
        string
      >;
      for (const [k, v] of Object.entries(parsed)) {
        this.buffer.set(k, v);
      }
      this.pending += 1;
    } catch {
      // Malformed updates are ignored — matches Yjs behavior where
      // unrecognized update bytes throw at the adapter boundary.
    }
  }

  getText(key: string = REALTIME_DOC_TEXT_KEY): string {
    return this.buffer.get(key) ?? "";
  }

  setText(text: string, key: string = REALTIME_DOC_TEXT_KEY): void {
    this.buffer.set(key, text);
    this.pending += 1;
  }

  pendingUpdateCount(): number {
    return this.pending;
  }

  /** Test seam — reset the pending counter after a snapshot
   *  broadcast. Production transports call this when ack-of-broadcast
   *  arrives. */
  resetPending(): void {
    this.pending = 0;
  }
}

// ============================================================================
// Session-layer wrapper
// ============================================================================

export interface RealtimeDocSessionKey {
  readonly vaultId: number;
  readonly noteId: number;
}

export type RealtimeDocBackendFactory = () => RealtimeDocBackend;

/**
 * One realtime session per (vaultId, noteId). Holds the backend
 * instance + a connected-client counter the transport uses to
 * decide when to garbage-collect. Generic over the backend so the
 * WebSocket transport (CRDT-γ) can plug in `YjsRealtimeDocBackend`.
 */
export class RealtimeDocSession {
  readonly key: RealtimeDocSessionKey;
  readonly backend: RealtimeDocBackend;
  private clients = 0;

  constructor(
    key: RealtimeDocSessionKey,
    factory: RealtimeDocBackendFactory = () => new InMemoryRealtimeDocBackend(),
  ) {
    this.key = key;
    this.backend = factory();
  }

  attachClient(): number {
    this.clients += 1;
    return this.clients;
  }

  detachClient(): number {
    this.clients = Math.max(0, this.clients - 1);
    return this.clients;
  }

  clientCount(): number {
    return this.clients;
  }

  /** Transport-friendly handler — applies a remote update. */
  handleUpdate(update: Uint8Array): void {
    this.backend.applyUpdate(update);
  }

  /** Returns a fresh snapshot for a newly-attached client. */
  snapshot(): Uint8Array {
    return this.backend.encodeSnapshot();
  }
}

// ============================================================================
// Save-boundary helper
// ============================================================================

/**
 * Extract the canonical text content for `agsNoteVersions` persistence.
 * Called by the Vault router's save path; the result is the
 * `body_markdown` column value.
 */
export function getCanonicalContentForSave(
  session: RealtimeDocSession,
): string {
  return session.backend.getText();
}

// ============================================================================
// Session registry (process-local; transport replaces with sharded version)
// ============================================================================

const sessionRegistry = new Map<string, RealtimeDocSession>();

function keyFor(key: RealtimeDocSessionKey): string {
  return `${key.vaultId}:${key.noteId}`;
}

/**
 * Return the active session for a (vaultId, noteId), creating it on
 * demand. Replaced in CRDT-γ by a transport-bound registry that
 * coordinates across server replicas.
 */
export function getOrCreateRealtimeDocSession(
  key: RealtimeDocSessionKey,
  factory?: RealtimeDocBackendFactory,
): RealtimeDocSession {
  const k = keyFor(key);
  const existing = sessionRegistry.get(k);
  if (existing) return existing;
  const session = new RealtimeDocSession(key, factory);
  sessionRegistry.set(k, session);
  return session;
}

/**
 * Drop the session from the registry. Transport invokes this when
 * the last client disconnects + the unsaved-update count is zero.
 */
export function dropRealtimeDocSession(key: RealtimeDocSessionKey): boolean {
  return sessionRegistry.delete(keyFor(key));
}

/** Test seam — drop every session. Production code MUST NOT call
 *  this. Source-scan tests pin the symbol's visibility. */
export function __resetRealtimeDocRegistryForTests(): void {
  sessionRegistry.clear();
}

/** Operator inspection — list live session keys (debug surface). */
export function listLiveRealtimeDocSessions(): RealtimeDocSessionKey[] {
  return [...sessionRegistry.values()].map((s) => s.key);
}
