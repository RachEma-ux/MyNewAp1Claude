/**
 * Phase 12.5 §10 — governance registry coverage for graphSkill
 * mutations.
 *
 * Mirrors the kb-router-governance pattern (R1-c2): every
 * `governedProcedure` declared in `graph-skill-router.ts` must have
 *   1. an entry in `server/governance/action-key-map.ts`
 *   2. an entry in `config/governance/platform_action_registry.yaml`
 *
 * If either is missing, the procedure ships dead-on-arrival because
 * the governance middleware throws "DENIED: Unknown action key" and
 * the trpc layer rethrows as HTTP 403.
 *
 * This test runs without a DB so the regression guard fires in
 * default CI even when ASDB is unavailable.
 */

import { describe, it, expect } from "vitest";
import { resolveActionKey } from "../../server/governance/action-key-map";
import { getActionDef } from "../../server/governance/action-registry";

describe("Phase 12.5 §10 — graphSkill mutations are registered for governance", () => {
  const cases = [
    {
      trpcPath: "agentStudio.graphSkill.createPack",
      expectedActionKey: "agentStudio.graphSkill.createPack",
    },
    {
      trpcPath: "agentStudio.graphSkill.publishVersion",
      expectedActionKey: "agentStudio.graphSkill.publishVersion",
    },
  ] as const;

  for (const c of cases) {
    it(`${c.trpcPath} resolves through action-key-map to a known action key`, () => {
      const actionKey = resolveActionKey(c.trpcPath);
      expect(actionKey).toBe(c.expectedActionKey);
    });

    it(`${c.trpcPath} action def loads from the YAML registry without throwing`, () => {
      const actionKey = resolveActionKey(c.trpcPath);
      const def = getActionDef(actionKey);
      expect(def).toBeDefined();
      expect(def.domain).toBe("agent");
      expect(def.capability).toBe("agent.manage");
      expect(def.stage).toBe("mutate");
      expect(def.risk).toBe("R2");
    });
  }
});
