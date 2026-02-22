import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // DEV MODE: Auto-login with test user (bypasses OAuth)
  // When DEV_MODE=true, always create a mock user regardless of NODE_ENV
  if (ENV.isDevMode) {
    user = {
      id: 1,
      openId: "dev-user-001",
      name: "Dev User",
      email: "dev@example.com",
      loginMethod: "dev-mode",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    return {
      req: opts.req,
      res: opts.res,
      user,
    };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
