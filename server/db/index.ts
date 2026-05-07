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
// Plan v3 Phase 31 (Phase 26.1) — barrel re-export of ai-types/db stripped.
// Catalog/taxonomy/audit helpers now live behind `ai-types/public-api.ts`;
// import them explicitly from there. The boundary lint enforces this.
