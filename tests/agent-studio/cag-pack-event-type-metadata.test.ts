/**
 * Phase G §T-G.43 — CAG pack-event-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_PACK_EVENT_TYPES,
  CAG_PACK_EVENT_TYPE_METADATA,
  CAG_PACK_EVENT_SEVERITIES,
  getCagPackEventTypeMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_PACK_EVENT_TYPE_METADATA (T-G.43)", () => {
  it("has metadata for every closed-taxonomy event type", () => {
    for (const t of CAG_PACK_EVENT_TYPES) {
      expect(CAG_PACK_EVENT_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_PACK_EVENT_TYPE_METADATA).length).toBe(
      CAG_PACK_EVENT_TYPES.length,
    );
  });

  it.each(CAG_PACK_EVENT_TYPES)(
    "%s has non-empty label + description + valid defaultSeverity + boolean isLifecycleTransition",
    (t) => {
      const md = CAG_PACK_EVENT_TYPE_METADATA[t];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(CAG_PACK_EVENT_SEVERITIES).toContain(md.defaultSeverity);
      expect(typeof md.isLifecycleTransition).toBe("boolean");
    },
  );

  it.each(CAG_PACK_EVENT_TYPES)(
    "getCagPackEventTypeMetadata(%s) returns table entry",
    (t) => {
      expect(getCagPackEventTypeMetadata(t)).toBe(
        CAG_PACK_EVENT_TYPE_METADATA[t],
      );
    },
  );

  it("pack_validation_failed is the only error-severity event", () => {
    const errors = CAG_PACK_EVENT_TYPES.filter(
      (t) => CAG_PACK_EVENT_TYPE_METADATA[t].defaultSeverity === "error",
    );
    expect(errors).toEqual(["pack_validation_failed"]);
  });

  it("pack_created + pack_marked_stale + pack_archived are exactly the lifecycle-transition events", () => {
    const transitions = new Set(
      CAG_PACK_EVENT_TYPES.filter(
        (t) => CAG_PACK_EVENT_TYPE_METADATA[t].isLifecycleTransition,
      ),
    );
    expect(transitions).toEqual(
      new Set(["pack_created", "pack_marked_stale", "pack_archived"]),
    );
  });

  it("pack_marked_stale + pack_refresh_forced are the warn-severity events", () => {
    const warns = new Set(
      CAG_PACK_EVENT_TYPES.filter(
        (t) => CAG_PACK_EVENT_TYPE_METADATA[t].defaultSeverity === "warn",
      ),
    );
    expect(warns).toEqual(new Set(["pack_marked_stale", "pack_refresh_forced"]));
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const t of CAG_PACK_EVENT_TYPES) {
      labels.add(CAG_PACK_EVENT_TYPE_METADATA[t].label);
    }
    expect(labels.size).toBe(CAG_PACK_EVENT_TYPES.length);
  });
});
