/**
 * Phase 14 §3 — governance registry coverage for the
 * graphAgent.pruneTraces mutation.
 *
 * Mirrors the R1-c2 kb-router and §10 graphSkill-router patterns:
 * every `governedProcedure` must be registered in both
 * `action-key-map.ts` and `platform_action_registry.yaml`. Missing
 * either → HTTP 403 (deny-by-default).
 */

import { describe, it, expect } from "vitest";
import { resolveActionKey } from "../../server/governance/action-key-map";
import { getActionDef } from "../../server/governance/action-registry";

describe("Phase 14 §3 — graphAgent.pruneTraces is registered for governance", () => {
  const trpcPath = "agentStudio.graphAgent.pruneTraces";

  it("resolves through action-key-map to the same action key", () => {
    expect(resolveActionKey(trpcPath)).toBe(trpcPath);
  });

  it("loads from the YAML registry at R3 / agent.manage / mutate", () => {
    const def = getActionDef(resolveActionKey(trpcPath));
    expect(def.domain).toBe("agent");
    expect(def.capability).toBe("agent.manage");
    expect(def.stage).toBe("mutate");
    expect(def.risk).toBe("R3");
  });
});
