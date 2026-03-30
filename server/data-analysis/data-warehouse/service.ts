/**
 * Data Warehouse — Service Layer
 *
 * CRUD queries against the dedicated `datawarehouse` DB.
 * All functions use getWarehouseDb() for the separate connection.
 */

import { eq, and, sql, or, ilike } from "drizzle-orm";
import { getWarehouseDb } from "./connection";
import {
  dwSectors,
  dwIndustries,
  dwScopes,
  dwStandards,
  dwIndustryScopeStandards,
} from "../../../drizzle/tables/data-warehouse";

function requireDb() {
  const db = getWarehouseDb();
  if (!db) throw new Error("DataWarehouse DB not available");
  return db;
}

// ── Sectors ─────────────────────────────────────────────────────────────────

export async function listSectors() {
  const db = requireDb();
  return db.select().from(dwSectors).orderBy(dwSectors.sectorCode);
}

// ── Industries ──────────────────────────────────────────────────────────────

export async function listIndustries(sectorCode?: string) {
  const db = requireDb();
  if (sectorCode) {
    return db
      .select()
      .from(dwIndustries)
      .where(eq(dwIndustries.sectorCode, sectorCode))
      .orderBy(dwIndustries.naicsCode);
  }
  return db.select().from(dwIndustries).orderBy(dwIndustries.naicsCode);
}

// ── Scopes ──────────────────────────────────────────────────────────────────

export async function listScopes(sectorCode?: string) {
  const db = requireDb();
  if (sectorCode) {
    return db
      .select()
      .from(dwScopes)
      .where(eq(dwScopes.sectorCode, sectorCode))
      .orderBy(dwScopes.sectorCode, dwScopes.scopeId);
  }
  return db.select().from(dwScopes).orderBy(dwScopes.sectorCode, dwScopes.scopeId);
}

// ── Standards ───────────────────────────────────────────────────────────────

export async function listStandards() {
  const db = requireDb();
  return db.select().from(dwStandards).orderBy(dwStandards.standardCode);
}

// ── Mappings (search with filters) ──────────────────────────────────────────

export async function searchMappings(filters: {
  sectorCode?: string;
  naicsCode?: string;
  scopeId?: string;
  searchText?: string;
}) {
  const db = requireDb();

  const conditions = [];

  if (filters.sectorCode) {
    conditions.push(eq(dwIndustryScopeStandards.sectorCode, filters.sectorCode));
  }
  if (filters.naicsCode) {
    conditions.push(eq(dwIndustryScopeStandards.naicsCode, filters.naicsCode));
  }
  if (filters.scopeId) {
    conditions.push(eq(dwIndustryScopeStandards.scopeId, filters.scopeId));
  }
  if (filters.searchText) {
    const pattern = `%${filters.searchText}%`;
    conditions.push(
      or(
        ilike(dwIndustryScopeStandards.standardCode, pattern),
        ilike(dwIndustryScopeStandards.relevance, pattern),
        ilike(dwIndustryScopeStandards.naicsCode, pattern)
      )!
    );
  }

  const query = db.select().from(dwIndustryScopeStandards);

  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(dwIndustryScopeStandards.naicsCode, dwIndustryScopeStandards.scopeId);
  }

  return query.orderBy(dwIndustryScopeStandards.naicsCode, dwIndustryScopeStandards.scopeId);
}

// ── Stats (counts per table) ────────────────────────────────────────────────

export async function getStats() {
  const db = requireDb();

  const [sectors, industries, scopes, standards, mappings] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(dwSectors),
    db.select({ count: sql<number>`count(*)::int` }).from(dwIndustries),
    db.select({ count: sql<number>`count(*)::int` }).from(dwScopes),
    db.select({ count: sql<number>`count(*)::int` }).from(dwStandards),
    db.select({ count: sql<number>`count(*)::int` }).from(dwIndustryScopeStandards),
  ]);

  return {
    sectors: sectors[0]?.count ?? 0,
    industries: industries[0]?.count ?? 0,
    scopes: scopes[0]?.count ?? 0,
    standards: standards[0]?.count ?? 0,
    mappings: mappings[0]?.count ?? 0,
  };
}
