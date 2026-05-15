/**
 * Realtime-doc message framing — V1+ CRDT-γ-3-framing (PR-V1-39).
 *
 * The CRDT-γ-2 transport (#774) currently forwards raw `Uint8Array`
 * frames straight to `session.handleUpdate(data)`. That works for
 * the OL-1..OL-9 + γ-2 scaffold but does NOT distinguish Yjs sync
 * messages from awareness messages, and does not reject malformed
 * or oversized payloads.
 *
 * This module ships the framing primitives the future transport-
 * level integration will compose with — separate from the transport
 * file so the framing logic stays unit-testable and reusable.
 *
 * Wire format (matches y-protocols/sync + y-protocols/awareness):
 *
 *   [ leading byte ][ frame-specific payload ]
 *
 *   leading byte = 0 → Yjs sync frame (Sync Step 1/2 + update)
 *   leading byte = 1 → Yjs awareness frame (presence / cursors)
 *   anything else    → unknown frame; rejected
 *
 * y-protocols uses VarInt for the message type. For the single-byte
 * 0/1 codepoints the encoded form IS just that byte; we do not need
 * a full VarInt decoder for the first slice (sync=0, awareness=1).
 *
 * Bounded frame size:
 *
 *   Default cap is `DEFAULT_MAX_REALTIME_DOC_FRAME_BYTES = 2 MiB`.
 *   Anything larger is rejected with `RealtimeDocFrameTooLargeError`.
 *   Operators may tune via the parse-call option but the default is
 *   load-bearing — an unbounded recv buffer is a DoS vector for the
 *   shared session backend.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure parsing + dispatch. No DB / IO. No `credential-resolver`,
 *     `dispatchMcpToolCall`, `*_API_KEY`, `neo4j-driver`,
 *     `openrouter`, or `GraphRepository` imports.
 *   - No persistence write. The dispatcher only decides "which
 *     handler runs"; persistence remains in the session backend /
 *     save-boundary helper per the existing CRDT ADR.
 *   - Auth context is NOT re-checked here. The transport's
 *     `attachConnection` (after `handleRealtimeDocUpgrade` already
 *     authorized) is the gate; once attached, all frames on that
 *     connection are accepted as authenticated.
 *
 * Out of scope for this PR (each a separate follow-up):
 *   - Transport-side wire-up. The CRDT-γ-2 message handler will
 *     compose `parseRealtimeDocFrame` + `dispatchRealtimeDocFrame`
 *     in a follow-up PR; the framing primitives must land first so
 *     tests can verify dispatch in isolation.
 *   - Real y-protocols sync engine (Sync Step 1 → Step 2 → update).
 *     This module hands the payload to a caller-supplied
 *     `onSync(payload, ctx)` closure; the engine sits behind that
 *     seam.
 *   - Real y-protocols awareness engine. Same DI-seam pattern.
 */

import type { RealtimeDocSession } from "./realtime-doc.js";

// ============================================================================
// Constants
// ============================================================================

/** Closed taxonomy. Anything not "sync"/"awareness" is "unknown". */
export const REALTIME_DOC_FRAME_TYPES = [
  "sync",
  "awareness",
  "unknown",
] as const;

export type RealtimeDocFrameType =
  (typeof REALTIME_DOC_FRAME_TYPES)[number];

/** Wire codepoint for y-protocols sync messages. */
export const FRAME_TYPE_BYTE_SYNC = 0;
/** Wire codepoint for y-protocols awareness messages. */
export const FRAME_TYPE_BYTE_AWARENESS = 1;

// ============================================================================
// Per-frame-type operator-facing metadata (T-B.2)
// ============================================================================

export interface RealtimeDocFrameTypeMetadata {
  /** Display label rendered in realtime-doc trace logs. */
  readonly label: string;
  /** Short operator-facing description of what the frame carries. */
  readonly description: string;
  /** Whether this frame type is a recognized y-protocols message
   *  (true) vs. unknown / malformed / future-protocol (false). */
  readonly recognized: boolean;
  /** Wire codepoint for this frame type, or `null` for `unknown`. */
  readonly wireCodepoint: number | null;
}

export const REALTIME_DOC_FRAME_TYPE_METADATA: Readonly<
  Record<RealtimeDocFrameType, RealtimeDocFrameTypeMetadata>
> = {
  sync: {
    label: "Sync",
    description:
      "y-protocols sync message — carries CRDT state updates. The framing dispatcher routes these to the realtime-doc transport.",
    recognized: true,
    wireCodepoint: FRAME_TYPE_BYTE_SYNC,
  },
  awareness: {
    label: "Awareness",
    description:
      "y-protocols awareness message — carries per-user cursor / presence updates. Lower-priority than sync; subject to throttling.",
    recognized: true,
    wireCodepoint: FRAME_TYPE_BYTE_AWARENESS,
  },
  unknown: {
    label: "Unknown",
    description:
      "Frame did not match a recognized y-protocols message codepoint — fall-through bucket for malformed or future-protocol frames. Dropped server-side.",
    recognized: false,
    wireCodepoint: null,
  },
};

export function getRealtimeDocFrameTypeMetadata(
  frameType: RealtimeDocFrameType,
): RealtimeDocFrameTypeMetadata {
  return REALTIME_DOC_FRAME_TYPE_METADATA[frameType];
}

/** Default frame-size cap. 2 MiB is generous for vault-note edits +
 *  multi-user cursor batches; tunable via `parseRealtimeDocFrame`
 *  option. */
export const DEFAULT_MAX_REALTIME_DOC_FRAME_BYTES = 2 * 1024 * 1024;

// ============================================================================
// Errors
// ============================================================================

export class RealtimeDocFrameTooLargeError extends Error {
  readonly code = "realtime_doc_frame_too_large";
  constructor(
    public readonly sizeBytes: number,
    public readonly limitBytes: number,
  ) {
    super(
      `Realtime-doc frame exceeds size cap: ${sizeBytes}B > ${limitBytes}B`,
    );
    this.name = "RealtimeDocFrameTooLargeError";
  }
}

export class RealtimeDocFrameEmptyError extends Error {
  readonly code = "realtime_doc_frame_empty";
  constructor() {
    super("Realtime-doc frame is empty (no leading type byte)");
    this.name = "RealtimeDocFrameEmptyError";
  }
}

// ============================================================================
// Pure parser
// ============================================================================

export function parseRealtimeDocFrameType(
  firstByte: number,
): RealtimeDocFrameType {
  if (firstByte === FRAME_TYPE_BYTE_SYNC) return "sync";
  if (firstByte === FRAME_TYPE_BYTE_AWARENESS) return "awareness";
  return "unknown";
}

export interface ParsedRealtimeDocFrame {
  readonly type: RealtimeDocFrameType;
  readonly leadingByte: number;
  /** Slice of the source buffer AFTER the leading type byte. The
   *  caller's frame handler decodes this further (e.g. a y-protocols
   *  sync handler reads the next VarInt to discriminate Step 1 vs
   *  Step 2 vs update). */
  readonly payload: Uint8Array;
  /** Total size of the input frame including the leading byte. */
  readonly totalBytes: number;
}

export interface ParseRealtimeDocFrameOptions {
  /** Override the default 2 MiB frame-size cap. */
  readonly maxBytes?: number;
}

/**
 * Parse one frame off the wire. Throws on empty / oversized inputs;
 * "unknown" type returns successfully so the dispatcher can route it
 * to `onUnknown` for graceful close-or-ignore.
 */
export function parseRealtimeDocFrame(
  data: Uint8Array,
  options: ParseRealtimeDocFrameOptions = {},
): ParsedRealtimeDocFrame {
  const limit = options.maxBytes ?? DEFAULT_MAX_REALTIME_DOC_FRAME_BYTES;
  if (data.byteLength === 0) {
    throw new RealtimeDocFrameEmptyError();
  }
  if (data.byteLength > limit) {
    throw new RealtimeDocFrameTooLargeError(data.byteLength, limit);
  }
  const leadingByte = data[0]!;
  return {
    type: parseRealtimeDocFrameType(leadingByte),
    leadingByte,
    payload: data.subarray(1),
    totalBytes: data.byteLength,
  };
}

// ============================================================================
// Dispatcher
// ============================================================================

export interface RealtimeDocFrameDispatchContext {
  /** Session the frame belongs to. Handlers may inspect snapshot /
   *  applyUpdate / etc. The framing layer does NOT mutate the
   *  session itself; handlers do. */
  readonly session: RealtimeDocSession;
}

export type RealtimeDocFrameHandler = (
  frame: ParsedRealtimeDocFrame,
  ctx: RealtimeDocFrameDispatchContext,
) => void | Promise<void>;

export interface RealtimeDocFrameHandlers {
  readonly onSync?: RealtimeDocFrameHandler;
  readonly onAwareness?: RealtimeDocFrameHandler;
  /** Called for any frame whose leading byte is neither 0 (sync) nor
   *  1 (awareness). Default behavior: no-op (drop). Operators may
   *  override to close the connection. */
  readonly onUnknown?: RealtimeDocFrameHandler;
}

export interface DispatchRealtimeDocFrameInput
  extends ParseRealtimeDocFrameOptions {
  readonly data: Uint8Array;
  readonly handlers: RealtimeDocFrameHandlers;
  readonly ctx: RealtimeDocFrameDispatchContext;
}

/**
 * Parse + dispatch one frame. Composes `parseRealtimeDocFrame` with
 * the handler table; rethrows parse errors so the caller (transport
 * message handler) can decide whether to close the connection or
 * log + drop.
 */
export async function dispatchRealtimeDocFrame(
  input: DispatchRealtimeDocFrameInput,
): Promise<ParsedRealtimeDocFrame> {
  const frame = parseRealtimeDocFrame(input.data, {
    maxBytes: input.maxBytes,
  });
  const handler =
    frame.type === "sync"
      ? input.handlers.onSync
      : frame.type === "awareness"
        ? input.handlers.onAwareness
        : input.handlers.onUnknown;
  if (handler) {
    await handler(frame, input.ctx);
  }
  return frame;
}
