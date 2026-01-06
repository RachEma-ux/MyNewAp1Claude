import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chatRouter } from "./router";
import { getProviderRegistry } from "../providers/registry";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
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

describe("chatRouter", () => {
  let ctx: TrpcContext;
  let caller: ReturnType<typeof chatRouter.createCaller>;

  beforeEach(() => {
    ctx = createTestContext();
    caller = chatRouter.createCaller(ctx);
  });

  // No cleanup needed - registry is singleton

  describe("getAvailableProviders", () => {
    it("should return empty array when no providers registered", async () => {
      const providers = await caller.getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });

  describe("testProvider", () => {
    it("should throw error for non-existent provider", async () => {
      await expect(
        caller.testProvider({ providerId: 999 })
      ).rejects.toThrow("Provider with ID 999 not found");
    });
  });
});
