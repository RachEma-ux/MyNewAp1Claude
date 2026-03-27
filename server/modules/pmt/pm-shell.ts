/**
 * PM Shell — Auto-managed workspace for PM Central
 *
 * PM Central operates as a standalone system. This module
 * auto-creates and caches a single "PM Shell" workspace so
 * the DB schema (which still has workspaceId columns) keeps
 * working — but no caller ever needs to know or pass a workspaceId.
 */

import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db/connection";
import { workspaces } from "../../../drizzle/tables/users";
import { seedWorkspaceModules } from "../registry";

let cachedWsId: number | null = null;

export async function getShellWorkspaceId(userId: number): Promise<number> {
  if (cachedWsId) return cachedWsId;

  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  const existing = await db.select().from(workspaces)
    .where(eq(workspaces.type, "pm-shell"))
    .limit(1);

  if (existing[0]) {
    cachedWsId = existing[0].id;
    return cachedWsId;
  }

  const [ws] = await db.insert(workspaces).values({
    name: "PM Shell",
    description: "Standalone PM Central workspace (auto-managed)",
    type: "pm-shell",
    ownerId: userId,
  }).returning();

  await seedWorkspaceModules(ws.id, "project");

  cachedWsId = ws.id;
  return cachedWsId;
}
