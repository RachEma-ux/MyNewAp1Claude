/**
 * Shell Backend Template — Module management router + registry
 *
 * This file shows the backend patterns needed to support a shell.
 * Copy relevant sections into your server code.
 */

// ============================================================================
// 1. DATABASE SCHEMA (drizzle/tables/your-modules.ts)
// ============================================================================

/*
import { serial, varchar, integer, boolean, timestamp, json, pgTable, unique } from "drizzle-orm/pg-core";
import { yourEntities } from "./your-entities";

// Module Keys — must match your frontend module keys
export const MY_MODULE_KEYS = ["dashboard", "settings", "reports"] as const;
export type MyModuleKey = typeof MY_MODULE_KEYS[number];

// Module bindings table
export const myEntityModules = pgTable("my_entity_modules", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().references(() => yourEntities.id),
  moduleKey: varchar("moduleKey", { length: 50 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  mode: varchar("mode", { length: 50 }).default("standard").notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  uniqueEntityModule: unique().on(table.entityId, table.moduleKey),
}));

// Activity log table
export const myEntityActivityLog = pgTable("my_entity_activity_log", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().references(() => yourEntities.id),
  moduleKey: varchar("moduleKey", { length: 50 }),
  actorId: integer("actorId"),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 50 }),
  targetId: integer("targetId"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
*/

// ============================================================================
// 2. MODULE REGISTRY (server/your-modules/registry.ts)
// ============================================================================

/*
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import { myEntityModules, MY_MODULE_KEYS, type MyModuleKey } from "../../drizzle/tables/your-modules";

// Module Presets — applied on entity creation
export const MODULE_PRESETS: Record<string, MyModuleKey[]> = {
  basic:    ["dashboard", "reports"],
  full:     ["dashboard", "settings", "reports"],
};

// Seed default modules
export async function seedModules(entityId: number, preset: string = "full") {
  const db = getDb();
  if (!db) return;
  const enabled = MODULE_PRESETS[preset] ?? MODULE_PRESETS.full;
  for (const key of MY_MODULE_KEYS) {
    await db.insert(myEntityModules)
      .values({ entityId, moduleKey: key, enabled: enabled.includes(key) })
      .onConflictDoNothing();
  }
}

// Get all module bindings
export async function getModules(entityId: number) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(myEntityModules).where(eq(myEntityModules.entityId, entityId));
}

// Check if module is enabled
export async function isModuleEnabled(entityId: number, moduleKey: MyModuleKey) {
  const db = getDb();
  if (!db) return false;
  const rows = await db.select().from(myEntityModules)
    .where(and(
      eq(myEntityModules.entityId, entityId),
      eq(myEntityModules.moduleKey, moduleKey),
      eq(myEntityModules.enabled, true)
    ))
    .limit(1);
  return rows.length > 0;
}

// Toggle module
export async function setModuleEnabled(entityId: number, moduleKey: MyModuleKey, enabled: boolean) {
  const db = getDb();
  if (!db) return;
  const existing = await db.select().from(myEntityModules)
    .where(and(eq(myEntityModules.entityId, entityId), eq(myEntityModules.moduleKey, moduleKey)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(myEntityModules).set({ enabled, updatedAt: new Date() })
      .where(eq(myEntityModules.id, existing[0].id));
  } else {
    await db.insert(myEntityModules).values({ entityId, moduleKey, enabled });
  }
}

// Guard — throws if module disabled
export async function requireModule(entityId: number, moduleKey: MyModuleKey) {
  if (!(await isModuleEnabled(entityId, moduleKey))) {
    throw new Error(`Module "${moduleKey}" is not enabled for entity ${entityId}`);
  }
}
*/

// ============================================================================
// 3. tRPC ROUTER (server/your-modules/router.ts)
// ============================================================================

/*
import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getModules, setModuleEnabled, seedModules } from "./registry";
import { MY_MODULE_KEYS } from "../../drizzle/tables/your-modules";

const moduleManageRouter = router({
  list: protectedProcedure
    .input(z.object({ entityId: z.number() }))
    .query(({ input }) => getModules(input.entityId)),

  setEnabled: governedProcedure
    .input(z.object({
      entityId: z.number(),
      moduleKey: z.enum(MY_MODULE_KEYS as unknown as [string, ...string[]]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await setModuleEnabled(input.entityId, input.moduleKey, input.enabled);
      return { success: true };
    }),

  seed: governedProcedure
    .input(z.object({ entityId: z.number(), preset: z.string().default("full") }))
    .mutation(async ({ input }) => {
      await seedModules(input.entityId, input.preset);
      return { success: true };
    }),
});

// Combine module management with engine sub-routers
export const myModulesRouter = router({
  manage: moduleManageRouter,
  // dashboard: dashboardRouter,
  // settings: settingsRouter,
  // reports: reportsRouter,
});
*/

// ============================================================================
// 4. WIRE INTO MAIN ROUTER (server/routers.ts)
// ============================================================================

/*
// Add to appRouter:
import { myModulesRouter } from "./your-modules/router";

export const appRouter = router({
  // ... existing routers
  myModules: myModulesRouter,
});
*/

// ============================================================================
// 5. ROUTE REGISTRATION (client/src/App.tsx)
// ============================================================================

/*
const MyShell = lazy(() => import("@/pages/MyShell"));

// In Router():
<Route path="/my-shell/:entityId/*" component={() => <ProtectedRoute component={MyShell} />} />
<Route path="/my-shell/:entityId" component={() => <ProtectedRoute component={MyShell} />} />
*/

export {};
