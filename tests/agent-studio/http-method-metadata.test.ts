/**
 * Phase G §T-G.54 — HTTP-method metadata lockstep (publish-target push).
 */

import { describe, it, expect } from "vitest";
import {
  HTTP_METHODS,
  HTTP_METHOD_METADATA,
  getHttpMethodMetadata,
} from "../../server/agent-studio/services/publish-targets/http-pusher.js";

describe("HTTP_METHOD_METADATA (T-G.54)", () => {
  it("has metadata for every closed-taxonomy method", () => {
    for (const m of HTTP_METHODS) {
      expect(HTTP_METHOD_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(HTTP_METHOD_METADATA).length).toBe(
      HTTP_METHODS.length,
    );
  });

  it.each(HTTP_METHODS)(
    "%s has non-empty label + description + boolean isCreate + boolean isIdempotent",
    (m) => {
      const md = HTTP_METHOD_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.isCreate).toBe("boolean");
      expect(typeof md.isIdempotent).toBe("boolean");
    },
  );

  it.each(HTTP_METHODS)(
    "getHttpMethodMetadata(%s) returns table entry",
    (m) => {
      expect(getHttpMethodMetadata(m)).toBe(HTTP_METHOD_METADATA[m]);
    },
  );

  it("POST is the only create method", () => {
    const creates = HTTP_METHODS.filter(
      (m) => HTTP_METHOD_METADATA[m].isCreate,
    );
    expect(creates).toEqual(["POST"]);
  });

  it("PUT is the only idempotent method", () => {
    const idempotent = HTTP_METHODS.filter(
      (m) => HTTP_METHOD_METADATA[m].isIdempotent,
    );
    expect(idempotent).toEqual(["PUT"]);
  });

  it("no method is simultaneously isCreate AND isIdempotent", () => {
    for (const m of HTTP_METHODS) {
      const md = HTTP_METHOD_METADATA[m];
      expect(md.isCreate && md.isIdempotent).toBe(false);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of HTTP_METHODS) {
      labels.add(HTTP_METHOD_METADATA[m].label);
    }
    expect(labels.size).toBe(HTTP_METHODS.length);
  });
});
