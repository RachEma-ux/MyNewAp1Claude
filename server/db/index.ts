// Barrel file: re-exports all database operations from domain-specific modules.
// Existing imports from "../db" or "./db" continue to work unchanged.

// Drizzle ORM re-exports
export { eq, and, desc, sql, inArray, ne } from "drizzle-orm";

// Connection & helpers
export { getDb, db, insertInto, updateTable } from "./connection";

// Domain modules
export * from "./users";
export * from "./workspaces";
export * from "./models";
export * from "./documents";
export * from "./agents";
export * from "./conversations";
export * from "./workflows";
export * from "./llms";
export * from "../ai-types/db";
