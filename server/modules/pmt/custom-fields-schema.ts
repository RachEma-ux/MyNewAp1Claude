/**
 * PMT Engine — Custom Fields Schema
 * User-defined fields and values for work items
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, pgTable, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../../drizzle/tables/users";
import { tasks } from "./schema";

export const pmCustomFields = pgTable("pm_custom_fields", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  fieldType: varchar("fieldType", { length: 30 }).notNull(),
  options: json("options").$type<string[]>(),
  required: boolean("required").default(false),
  position: integer("position").notNull(),
  helpText: text("helpText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_custom_fields_ws").on(table.workspaceId),
}));

export type PmCustomField = typeof pmCustomFields.$inferSelect;

export const pmCustomValues = pgTable("pm_custom_values", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").notNull().references(() => tasks.id),
  fieldId: integer("fieldId").notNull().references(() => pmCustomFields.id),
  value: text("value"),
}, (table) => ({
  wsIdx: index("idx_pm_custom_values_ws").on(table.workspaceId),
  workItemIdx: index("idx_pm_custom_values_work_item").on(table.workItemId),
  uniqueFieldValue: uniqueIndex("idx_pm_custom_values_unique").on(table.workItemId, table.fieldId),
}));

export type PmCustomValue = typeof pmCustomValues.$inferSelect;
