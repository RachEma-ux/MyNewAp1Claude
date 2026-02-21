import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../drizzle/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
      console.log("[Database] Initializing Drizzle with URL:", dbUrl);

      _db = drizzle(process.env.DATABASE_URL, { schema });
      console.log("[Database] Drizzle instance created successfully");
    } catch (error) {
      console.error("[Database] Failed to create Drizzle instance:", error);
      _db = null;
    }
  } else if (!process.env.DATABASE_URL) {
    console.error("[Database] DATABASE_URL environment variable is not set!");
  }
  return _db;
}

export const db = {
  get instance() {
    return getDb();
  },
  select() {
    const dbInstance = getDb();
    if (!dbInstance) throw new Error("Database not available");
    return dbInstance.select();
  },
  insert<T extends Parameters<NonNullable<ReturnType<typeof getDb>>["insert"]>[0]>(table: T) {
    const dbInstance = getDb();
    if (!dbInstance) throw new Error("Database not available");
    return dbInstance.insert(table);
  },
  update<T extends Parameters<NonNullable<ReturnType<typeof getDb>>["update"]>[0]>(table: T) {
    const dbInstance = getDb();
    if (!dbInstance) throw new Error("Database not available");
    return dbInstance.update(table);
  },
  delete<T extends Parameters<NonNullable<ReturnType<typeof getDb>>["delete"]>[0]>(table: T) {
    const dbInstance = getDb();
    if (!dbInstance) throw new Error("Database not available");
    return dbInstance.delete(table);
  },
};

export function insertInto<T extends Parameters<NonNullable<ReturnType<typeof getDb>>["insert"]>[0]>(table: T) {
  const dbInstance = getDb();
  if (!dbInstance) throw new Error("Database not available");
  return dbInstance.insert(table);
}

export function updateTable<T extends Parameters<NonNullable<ReturnType<typeof getDb>>["update"]>[0]>(table: T) {
  const dbInstance = getDb();
  if (!dbInstance) throw new Error("Database not available");
  return dbInstance.update(table);
}
