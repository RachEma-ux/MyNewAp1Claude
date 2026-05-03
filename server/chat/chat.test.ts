import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appRouter } from "../routers";
import { getProviderRegistry } from "../providers/registry";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "test@example.com",
    name: "Test Admin",
    loginMethod: "manus",
    // Admin role bypasses the chat.use capability check; we want
    // the test to exercise the procedure body, not the governance
    // stack, since the assertion is on the not-found error path.
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("chatRouter (mounted on appRouter)", () => {
  // The test calls through appRouter so tRPC paths resolve as
  // `chat.<procedure>` — matching the production action-registry
  // keys (`chat.testProvider`, `chat.send`, …) and avoiding a
  // deny-by-default action-registry block on the bare procedure name.
  let ctx: TrpcContext;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    ctx = createTestContext();
    caller = appRouter.createCaller(ctx);
  });

  // No cleanup needed - registry is singleton

  describe("getAvailableProviders", () => {
    it("should return empty array when no providers registered", async () => {
      const providers = await caller.chat.getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });

  describe("testProvider", () => {
    it("should throw error for non-existent provider", async () => {
      await expect(
        caller.chat.testProvider({ providerId: 999 })
      ).rejects.toThrow("Provider with ID 999 not found");
    });
  });
});
