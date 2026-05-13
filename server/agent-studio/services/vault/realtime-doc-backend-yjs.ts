/**
 * Yjs adapter for the realtime-doc contract — V2 Phase CRDT-γ.
 *
 * CRDT-β (#764) shipped `RealtimeDocBackend` + `InMemoryRealtimeDocBackend`
 * (reference impl). This PR adds the production Yjs adapter that
 * implements the same contract — CRDT-correct concurrent merges,
 * Y.Text-backed canonical content, byte-stable snapshots compatible
 * with the standard y-protocols update format.
 *
 * Why a thin namespace-injection seam (not a top-level `import * as Y
 * from "yjs"`):
 *   - The adapter file stays import-free, so unit tests run locally
 *     without yjs installed (lockfile-divergence pattern documented
 *     in the V1+ project memory).
 *   - Production callers import yjs once at boot time and pass the
 *     Y namespace into `createYjsRealtimeDocBackend(Y)`.
 *   - The CRDT semantics live in Y itself; this adapter is a pure
 *     wire-up, fully testable against a typed fake.
 *
 * WebSocket transport (CRDT-γ-2):
 *   - The transport calls `backend.applyUpdate(update)` for inbound
 *     CRDT updates from peers, and broadcasts the result of
 *     `encodeStateAsUpdate(doc)` (returned by `encodeSnapshot()`) to
 *     other clients. The CRDT-γ-2 PR lands the y-protocols
 *     sync-message-handler routes; this PR is the adapter half only.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No top-level `import * as Y from "yjs"` (lazy via DI).
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 *   - Postgres = source of truth. Canonical writes go through the
 *     Vault repository at save boundaries.
 *
 * Source-scan tested.
 */

import {
  REALTIME_DOC_TEXT_KEY,
  type RealtimeDocBackend,
} from "./realtime-doc.js";

// ============================================================================
// Type-only namespace interface (matches the subset of yjs we use)
// ============================================================================

/** Minimal Y.Text shape — only the methods this adapter exercises. */
export interface YText {
  toString(): string;
  insert(index: number, content: string): void;
  delete(index: number, length: number): void;
  readonly length: number;
}

/** Minimal Y.Doc shape — only the methods this adapter exercises. */
export interface YDoc {
  getText(name: string): YText;
  /** Observer hook used to bump `pendingUpdateCount`. */
  on(event: "update", handler: (update: Uint8Array) => void): void;
}

/** Subset of the `yjs` package namespace this adapter consumes. */
export interface YjsNamespace {
  Doc: new () => YDoc;
  encodeStateAsUpdate(doc: YDoc): Uint8Array;
  applyUpdate(doc: YDoc, update: Uint8Array): void;
}

// ============================================================================
// Adapter
// ============================================================================

export class YjsRealtimeDocBackend implements RealtimeDocBackend {
  private readonly doc: YDoc;
  private pending = 0;

  constructor(private readonly Y: YjsNamespace) {
    this.doc = new Y.Doc();
    this.doc.on("update", () => {
      this.pending += 1;
    });
  }

  /** Underlying Y.Doc — exposed for transport layers that need
   *  direct access to wire y-protocols sync messages. */
  getDoc(): YDoc {
    return this.doc;
  }

  encodeSnapshot(): Uint8Array {
    return this.Y.encodeStateAsUpdate(this.doc);
  }

  applyUpdate(update: Uint8Array): void {
    this.Y.applyUpdate(this.doc, update);
  }

  getText(key: string = REALTIME_DOC_TEXT_KEY): string {
    return this.doc.getText(key).toString();
  }

  setText(text: string, key: string = REALTIME_DOC_TEXT_KEY): void {
    const ytext = this.doc.getText(key);
    // Replace semantics: delete the entire prior buffer, then
    // insert the new text. Yjs CRDT semantics convert this into a
    // pair of operations that peers merge deterministically.
    if (ytext.length > 0) {
      ytext.delete(0, ytext.length);
    }
    ytext.insert(0, text);
  }

  pendingUpdateCount(): number {
    return this.pending;
  }

  /** Reset the pending counter — transport calls this on broadcast ack. */
  resetPending(): void {
    this.pending = 0;
  }
}

/**
 * Factory — convenience wrapper so callers don't have to remember
 * the constructor + DI shape:
 *
 *   import * as Y from "yjs";
 *   const backend = createYjsRealtimeDocBackend(Y);
 */
export function createYjsRealtimeDocBackend(
  Y: YjsNamespace,
): YjsRealtimeDocBackend {
  return new YjsRealtimeDocBackend(Y);
}
