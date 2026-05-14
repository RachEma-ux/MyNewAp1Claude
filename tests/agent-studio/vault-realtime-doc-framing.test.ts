/**
 * Realtime-doc message framing — V1+ CRDT-γ-3-framing (PR-V1-39).
 *
 * Covers:
 *   - REALTIME_DOC_FRAME_TYPES closed 3-value taxonomy
 *   - parseRealtimeDocFrameType:
 *     - byte 0  → "sync"
 *     - byte 1  → "awareness"
 *     - bytes 2..255 → "unknown"
 *   - parseRealtimeDocFrame:
 *     - happy path with sync payload returns { type, payload, leadingByte, totalBytes }
 *     - awareness leading byte returns "awareness"
 *     - unknown leading byte returns "unknown" (no throw — caller decides)
 *     - empty buffer throws RealtimeDocFrameEmptyError
 *     - oversize buffer throws RealtimeDocFrameTooLargeError (default + custom limits)
 *     - payload is a subarray view (no copy)
 *   - dispatchRealtimeDocFrame:
 *     - sync frame → onSync invoked with frame + ctx; others NOT invoked
 *     - awareness frame → onAwareness invoked
 *     - unknown frame → onUnknown invoked (when set); no-op when unset
 *     - missing handler for the resolved type → no-op (no throw)
 *     - parse error propagates from dispatch (caller decides close vs drop)
 *     - returns the parsed frame so the caller can inspect totalBytes etc.
 *   - Source-scan boundary
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_REALTIME_DOC_FRAME_BYTES,
  FRAME_TYPE_BYTE_AWARENESS,
  FRAME_TYPE_BYTE_SYNC,
  REALTIME_DOC_FRAME_TYPES,
  RealtimeDocFrameEmptyError,
  RealtimeDocFrameTooLargeError,
  dispatchRealtimeDocFrame,
  parseRealtimeDocFrame,
  parseRealtimeDocFrameType,
  type RealtimeDocFrameDispatchContext,
  type RealtimeDocFrameHandlers,
} from "../../server/agent-studio/services/vault/realtime-doc-framing.js";
import type { RealtimeDocSession } from "../../server/agent-studio/services/vault/realtime-doc.js";

// Stub session — framing layer does not call methods on it; handlers
// may. We just need an object shaped like RealtimeDocSession.
const STUB_SESSION = {
  key: { vaultId: 1, noteId: 1 },
} as unknown as RealtimeDocSession;

const CTX: RealtimeDocFrameDispatchContext = { session: STUB_SESSION };

// ============================================================================
// Taxonomy + parseRealtimeDocFrameType
// ============================================================================

describe("REALTIME_DOC_FRAME_TYPES taxonomy", () => {
  it("is a closed 3-value union", () => {
    expect([...REALTIME_DOC_FRAME_TYPES]).toEqual([
      "sync",
      "awareness",
      "unknown",
    ]);
  });
});

describe("parseRealtimeDocFrameType", () => {
  it("byte 0 → sync", () => {
    expect(parseRealtimeDocFrameType(FRAME_TYPE_BYTE_SYNC)).toBe("sync");
  });

  it("byte 1 → awareness", () => {
    expect(parseRealtimeDocFrameType(FRAME_TYPE_BYTE_AWARENESS)).toBe(
      "awareness",
    );
  });

  it.each([[2], [42], [127], [255]])("byte %i → unknown", (b) => {
    expect(parseRealtimeDocFrameType(b)).toBe("unknown");
  });
});

// ============================================================================
// parseRealtimeDocFrame
// ============================================================================

describe("parseRealtimeDocFrame — happy paths", () => {
  it("sync frame returns type=sync + payload slice after leading byte", () => {
    const data = new Uint8Array([0, 10, 20, 30]);
    const parsed = parseRealtimeDocFrame(data);
    expect(parsed.type).toBe("sync");
    expect(parsed.leadingByte).toBe(0);
    expect(Array.from(parsed.payload)).toEqual([10, 20, 30]);
    expect(parsed.totalBytes).toBe(4);
  });

  it("awareness frame returns type=awareness", () => {
    const data = new Uint8Array([1, 99]);
    const parsed = parseRealtimeDocFrame(data);
    expect(parsed.type).toBe("awareness");
    expect(parsed.leadingByte).toBe(1);
    expect(Array.from(parsed.payload)).toEqual([99]);
  });

  it("unknown leading byte returns type=unknown WITHOUT throwing (caller decides)", () => {
    const data = new Uint8Array([42, 1, 2, 3]);
    const parsed = parseRealtimeDocFrame(data);
    expect(parsed.type).toBe("unknown");
    expect(parsed.leadingByte).toBe(42);
    expect(Array.from(parsed.payload)).toEqual([1, 2, 3]);
  });

  it("single-byte frame returns empty payload subarray", () => {
    const parsed = parseRealtimeDocFrame(new Uint8Array([0]));
    expect(parsed.type).toBe("sync");
    expect(parsed.payload.byteLength).toBe(0);
  });

  it("payload is a subarray view (no copy)", () => {
    const data = new Uint8Array([0, 10, 20]);
    const parsed = parseRealtimeDocFrame(data);
    // subarray shares the buffer; mutating one reflects in the other.
    data[1] = 99;
    expect(parsed.payload[0]).toBe(99);
  });
});

describe("parseRealtimeDocFrame — error paths", () => {
  it("empty buffer throws RealtimeDocFrameEmptyError", () => {
    expect(() => parseRealtimeDocFrame(new Uint8Array([]))).toThrow(
      RealtimeDocFrameEmptyError,
    );
  });

  it("oversize buffer (over default 2 MiB) throws RealtimeDocFrameTooLargeError", () => {
    const oversized = new Uint8Array(DEFAULT_MAX_REALTIME_DOC_FRAME_BYTES + 1);
    expect(() => parseRealtimeDocFrame(oversized)).toThrow(
      RealtimeDocFrameTooLargeError,
    );
  });

  it("oversize buffer (over custom limit) throws with the configured cap", () => {
    const data = new Uint8Array([0, 1, 2, 3, 4]);
    try {
      parseRealtimeDocFrame(data, { maxBytes: 3 });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RealtimeDocFrameTooLargeError);
      const e = err as RealtimeDocFrameTooLargeError;
      expect(e.sizeBytes).toBe(5);
      expect(e.limitBytes).toBe(3);
      expect(e.code).toBe("realtime_doc_frame_too_large");
    }
  });

  it("at-limit buffer (exactly cap) does NOT throw", () => {
    // 1 byte type + 2 bytes payload = 3 bytes total; cap = 3.
    const data = new Uint8Array([0, 1, 2]);
    expect(() => parseRealtimeDocFrame(data, { maxBytes: 3 })).not.toThrow();
  });
});

// ============================================================================
// dispatchRealtimeDocFrame
// ============================================================================

describe("dispatchRealtimeDocFrame — handler routing", () => {
  it("sync frame → onSync invoked with parsed frame + ctx; others NOT invoked", async () => {
    const onSync = vi.fn();
    const onAwareness = vi.fn();
    const onUnknown = vi.fn();
    const handlers: RealtimeDocFrameHandlers = {
      onSync,
      onAwareness,
      onUnknown,
    };
    const data = new Uint8Array([0, 7, 8]);
    const result = await dispatchRealtimeDocFrame({ data, handlers, ctx: CTX });
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onAwareness).not.toHaveBeenCalled();
    expect(onUnknown).not.toHaveBeenCalled();
    const [frame, dispatchedCtx] = onSync.mock.calls[0] as [
      ReturnType<typeof parseRealtimeDocFrame>,
      RealtimeDocFrameDispatchContext,
    ];
    expect(frame.type).toBe("sync");
    expect(Array.from(frame.payload)).toEqual([7, 8]);
    expect(dispatchedCtx).toBe(CTX);
    expect(result.type).toBe("sync");
  });

  it("awareness frame → onAwareness invoked", async () => {
    const onSync = vi.fn();
    const onAwareness = vi.fn();
    await dispatchRealtimeDocFrame({
      data: new Uint8Array([1, 9]),
      handlers: { onSync, onAwareness },
      ctx: CTX,
    });
    expect(onAwareness).toHaveBeenCalledTimes(1);
    expect(onSync).not.toHaveBeenCalled();
  });

  it("unknown frame → onUnknown invoked when set", async () => {
    const onSync = vi.fn();
    const onUnknown = vi.fn();
    await dispatchRealtimeDocFrame({
      data: new Uint8Array([99, 1]),
      handlers: { onSync, onUnknown },
      ctx: CTX,
    });
    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(onSync).not.toHaveBeenCalled();
  });

  it("unknown frame with NO onUnknown → no-op (does not throw)", async () => {
    await expect(
      dispatchRealtimeDocFrame({
        data: new Uint8Array([99, 1]),
        handlers: {},
        ctx: CTX,
      }),
    ).resolves.toMatchObject({ type: "unknown" });
  });

  it("missing handler for the resolved type → no-op (no throw)", async () => {
    // Sync frame, no onSync registered.
    await expect(
      dispatchRealtimeDocFrame({
        data: new Uint8Array([0, 1, 2]),
        handlers: {},
        ctx: CTX,
      }),
    ).resolves.toMatchObject({ type: "sync" });
  });

  it("parse error (empty frame) propagates to the caller", async () => {
    await expect(
      dispatchRealtimeDocFrame({
        data: new Uint8Array([]),
        handlers: {},
        ctx: CTX,
      }),
    ).rejects.toThrow(RealtimeDocFrameEmptyError);
  });

  it("parse error (oversize) propagates to the caller", async () => {
    await expect(
      dispatchRealtimeDocFrame({
        data: new Uint8Array([0, 1, 2, 3, 4]),
        handlers: {},
        ctx: CTX,
        maxBytes: 3,
      }),
    ).rejects.toThrow(RealtimeDocFrameTooLargeError);
  });

  it("async handler is awaited (rejection propagates to caller)", async () => {
    await expect(
      dispatchRealtimeDocFrame({
        data: new Uint8Array([0, 1]),
        handlers: {
          onSync: async () => {
            throw new Error("handler failed");
          },
        },
        ctx: CTX,
      }),
    ).rejects.toThrow(/handler failed/);
  });
});

// ============================================================================
// Source-scan boundary
// ============================================================================

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/realtime-doc-framing.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import openrouter model-access", () => {
    expect(
      /from\s+["'][^"']*openrouter\/model-access/.test(src),
    ).toBe(false);
  });

  it("does not import GraphRepository", () => {
    expect(/from\s+["'][^"']*graph\/repository/.test(src)).toBe(false);
  });

  it("does not import drizzle-orm (pure framing, no DB)", () => {
    expect(/from\s+["']drizzle-orm/.test(src)).toBe(false);
  });

  it("does not import y-protocols (DI seam — engine plugs in later)", () => {
    expect(/from\s+["']y-protocols/.test(src)).toBe(false);
  });
});
