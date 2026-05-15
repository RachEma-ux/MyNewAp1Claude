/**
 * Phase B §T-B.2 — realtime-doc frame-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  REALTIME_DOC_FRAME_TYPES,
  REALTIME_DOC_FRAME_TYPE_METADATA,
  FRAME_TYPE_BYTE_SYNC,
  FRAME_TYPE_BYTE_AWARENESS,
  getRealtimeDocFrameTypeMetadata,
} from "../../server/agent-studio/services/vault/realtime-doc-framing.js";

describe("REALTIME_DOC_FRAME_TYPE_METADATA (T-B.2)", () => {
  it("has metadata for every closed-taxonomy frame type", () => {
    for (const t of REALTIME_DOC_FRAME_TYPES) {
      expect(REALTIME_DOC_FRAME_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(REALTIME_DOC_FRAME_TYPE_METADATA).length).toBe(
      REALTIME_DOC_FRAME_TYPES.length,
    );
  });

  it.each(REALTIME_DOC_FRAME_TYPES)(
    "%s has non-empty label + description + boolean recognized + nullable wireCodepoint",
    (t) => {
      const md = REALTIME_DOC_FRAME_TYPE_METADATA[t];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.recognized).toBe("boolean");
      expect(md.wireCodepoint === null || typeof md.wireCodepoint === "number")
        .toBe(true);
    },
  );

  it.each(REALTIME_DOC_FRAME_TYPES)(
    "getRealtimeDocFrameTypeMetadata(%s) returns table entry",
    (t) => {
      expect(getRealtimeDocFrameTypeMetadata(t)).toBe(
        REALTIME_DOC_FRAME_TYPE_METADATA[t],
      );
    },
  );

  it("recognized=true ⇔ wireCodepoint is non-null", () => {
    for (const t of REALTIME_DOC_FRAME_TYPES) {
      const md = REALTIME_DOC_FRAME_TYPE_METADATA[t];
      if (md.recognized) {
        expect(md.wireCodepoint).not.toBeNull();
      } else {
        expect(md.wireCodepoint).toBeNull();
      }
    }
  });

  it("only `unknown` is non-recognized", () => {
    expect(REALTIME_DOC_FRAME_TYPE_METADATA.sync.recognized).toBe(true);
    expect(REALTIME_DOC_FRAME_TYPE_METADATA.awareness.recognized).toBe(true);
    expect(REALTIME_DOC_FRAME_TYPE_METADATA.unknown.recognized).toBe(false);
  });

  it("wire codepoints match the published constants", () => {
    expect(REALTIME_DOC_FRAME_TYPE_METADATA.sync.wireCodepoint).toBe(
      FRAME_TYPE_BYTE_SYNC,
    );
    expect(REALTIME_DOC_FRAME_TYPE_METADATA.awareness.wireCodepoint).toBe(
      FRAME_TYPE_BYTE_AWARENESS,
    );
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const t of REALTIME_DOC_FRAME_TYPES) {
      labels.add(REALTIME_DOC_FRAME_TYPE_METADATA[t].label);
    }
    expect(labels.size).toBe(REALTIME_DOC_FRAME_TYPES.length);
  });
});
