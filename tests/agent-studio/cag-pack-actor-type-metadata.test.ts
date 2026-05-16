/**
 * Phase G §T-G.42 — CAG pack-actor-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_PACK_ACTOR_TYPES,
  CAG_PACK_ACTOR_TYPE_METADATA,
  getCagPackActorTypeMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_PACK_ACTOR_TYPE_METADATA (T-G.42)", () => {
  it("has metadata for every closed-taxonomy actor type", () => {
    for (const a of CAG_PACK_ACTOR_TYPES) {
      expect(CAG_PACK_ACTOR_TYPE_METADATA[a]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_PACK_ACTOR_TYPE_METADATA).length).toBe(
      CAG_PACK_ACTOR_TYPES.length,
    );
  });

  it.each(CAG_PACK_ACTOR_TYPES)(
    "%s has non-empty label + description + boolean requiresUserId + boolean isAutomated",
    (a) => {
      const md = CAG_PACK_ACTOR_TYPE_METADATA[a];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.requiresUserId).toBe("boolean");
      expect(typeof md.isAutomated).toBe("boolean");
    },
  );

  it.each(CAG_PACK_ACTOR_TYPES)(
    "getCagPackActorTypeMetadata(%s) returns table entry",
    (a) => {
      expect(getCagPackActorTypeMetadata(a)).toBe(
        CAG_PACK_ACTOR_TYPE_METADATA[a],
      );
    },
  );

  it("user is the only actor type requiring a user ID", () => {
    const reqUser = CAG_PACK_ACTOR_TYPES.filter(
      (a) => CAG_PACK_ACTOR_TYPE_METADATA[a].requiresUserId,
    );
    expect(reqUser).toEqual(["user"]);
  });

  it("system + scheduler + runtime are exactly the automated actors", () => {
    const automated = new Set(
      CAG_PACK_ACTOR_TYPES.filter(
        (a) => CAG_PACK_ACTOR_TYPE_METADATA[a].isAutomated,
      ),
    );
    expect(automated).toEqual(new Set(["system", "scheduler", "runtime"]));
  });

  it("requiresUserId and isAutomated are mutually exclusive", () => {
    for (const a of CAG_PACK_ACTOR_TYPES) {
      const md = CAG_PACK_ACTOR_TYPE_METADATA[a];
      expect(md.requiresUserId && md.isAutomated).toBe(false);
    }
  });

  it("every actor type is either requiresUserId or isAutomated (exhaustive)", () => {
    for (const a of CAG_PACK_ACTOR_TYPES) {
      const md = CAG_PACK_ACTOR_TYPE_METADATA[a];
      expect(md.requiresUserId || md.isAutomated).toBe(true);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const a of CAG_PACK_ACTOR_TYPES) {
      labels.add(CAG_PACK_ACTOR_TYPE_METADATA[a].label);
    }
    expect(labels.size).toBe(CAG_PACK_ACTOR_TYPES.length);
  });
});
