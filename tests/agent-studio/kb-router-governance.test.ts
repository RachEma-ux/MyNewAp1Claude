/**
 * R1-c2 — governance registry coverage for U5-b.4 kb mutations.
 *
 * Cycle-2 audit (`/sdcard/Download/RAC_AUDIT_2026-05-08-cycle2.md` §3.1)
 * found that `kb.setLicense` and `kb.clearPiiFindings` shipped as
 * `governedProcedure` in `server/agent-studio/api/kb-router.ts` without
 * entries in `server/governance/action-key-map.ts` or
 * `config/governance/platform_action_registry.yaml`. Every call returned
 * HTTP 403 because:
 *
 *   1. `resolveActionKey(trpcPath)` fell through to the trpcPath
 *      (no map entry → action-key-map.ts:540-542).
 *   2. `getActionDef(actionKey)` threw "Unknown action key" (deny-by-default
 *      per action-registry.ts:142-153).
 *   3. The throw was caught at trpc.ts:111-116 and rethrown as
 *      `TRPCError({ code: "FORBIDDEN" })`.
 *
 * This test runs in default CI (no DB) and locks both mutations into
 * the registry path. Failure mode: if either entry is removed from
 * the action-key-map or the YAML registry, the test fails with a
 * direct pointer at the missing key.
 *
 * The companion integration test in
 * `tests/integration/agent-studio/kb-router.integration.test.ts`
 * covers the end-to-end path (DB-backed); this unit test covers the
 * registry path in isolation so the regression guard fires even when
 * the integration test is skipped (no DATABASE_URL_ASDB in CI).
 */

import { describe, it, expect } from "vitest";
import { resolveActionKey } from "../../server/governance/action-key-map";
import { getActionDef } from "../../server/governance/action-registry";

describe("RETROFIT R1-c2 — kb-router U5-b.4 mutations are registered for governance", () => {
  const cases = [
    {
      trpcPath: "agentStudio.kb.setLicense",
      expectedActionKey: "agentStudio.kb.setLicense",
    },
    {
      trpcPath: "agentStudio.kb.clearPiiFindings",
      expectedActionKey: "agentStudio.kb.clearPiiFindings",
    },
  ] as const;

  for (const c of cases) {
    it(`${c.trpcPath} resolves through action-key-map to a known action key`, () => {
      const actionKey = resolveActionKey(c.trpcPath);
      expect(actionKey).toBe(c.expectedActionKey);
    });

    it(`${c.trpcPath} action def loads from the YAML registry without throwing`, () => {
      const actionKey = resolveActionKey(c.trpcPath);
      // getActionDef throws "DENIED: Unknown action key" if the key is
      // absent from platform_action_registry.yaml. The whole point of
      // R1-c2 is that this throw must NOT happen.
      const def = getActionDef(actionKey);
      expect(def).toBeDefined();
      expect(def.domain).toBe("knowledge");
      expect(def.capability).toBe("knowledge.manage");
      expect(def.stage).toBe("mutate");
      expect(def.risk).toBe("R2");
    });
  }
});
