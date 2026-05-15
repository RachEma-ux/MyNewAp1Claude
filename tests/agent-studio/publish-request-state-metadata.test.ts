/**
 * Phase L §T-L.1 — publish-request-state metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PUBLISH_REQUEST_STATES,
  PUBLISH_REQUEST_TERMINAL_STATES,
  PUBLISH_REQUEST_STATE_METADATA,
  getPublishRequestStateMetadata,
} from "../../server/agent-studio/services/retention/lifecycle-state-vocab.js";

describe("PUBLISH_REQUEST_STATE_METADATA (T-L.1)", () => {
  it("has metadata for every closed-taxonomy state", () => {
    for (const s of PUBLISH_REQUEST_STATES) {
      expect(PUBLISH_REQUEST_STATE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(PUBLISH_REQUEST_STATE_METADATA).length).toBe(
      PUBLISH_REQUEST_STATES.length,
    );
  });

  it.each(PUBLISH_REQUEST_STATES)(
    "%s has non-empty label + description + valid outcome + boolean terminal",
    (s) => {
      const md = PUBLISH_REQUEST_STATE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "awaiting",
        "accepted",
        "declined",
        "withdrawn",
        "obsolete",
        "terminal_failure",
      ]).toContain(md.outcome);
      expect(typeof md.terminal).toBe("boolean");
    },
  );

  it.each(PUBLISH_REQUEST_STATES)(
    "getPublishRequestStateMetadata(%s) returns table entry",
    (s) => {
      expect(getPublishRequestStateMetadata(s)).toBe(
        PUBLISH_REQUEST_STATE_METADATA[s],
      );
    },
  );

  it("metadata.terminal mirrors PUBLISH_REQUEST_TERMINAL_STATES exactly", () => {
    for (const s of PUBLISH_REQUEST_STATES) {
      const expected = PUBLISH_REQUEST_TERMINAL_STATES.has(s);
      expect(PUBLISH_REQUEST_STATE_METADATA[s].terminal).toBe(expected);
    }
  });

  it("only `pending` is non-terminal (outcome: awaiting)", () => {
    expect(PUBLISH_REQUEST_STATE_METADATA.pending.terminal).toBe(false);
    expect(PUBLISH_REQUEST_STATE_METADATA.pending.outcome).toBe("awaiting");
    for (const s of PUBLISH_REQUEST_STATES) {
      if (s !== "pending") {
        expect(PUBLISH_REQUEST_STATE_METADATA[s].terminal).toBe(true);
      }
    }
  });

  it("awaiting outcome implies non-terminal; non-awaiting outcomes are terminal", () => {
    for (const s of PUBLISH_REQUEST_STATES) {
      const md = PUBLISH_REQUEST_STATE_METADATA[s];
      if (md.outcome === "awaiting") {
        expect(md.terminal).toBe(false);
      } else {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of PUBLISH_REQUEST_STATES) {
      labels.add(PUBLISH_REQUEST_STATE_METADATA[s].label);
    }
    expect(labels.size).toBe(PUBLISH_REQUEST_STATES.length);
  });
});
