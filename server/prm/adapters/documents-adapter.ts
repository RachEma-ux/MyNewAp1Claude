/**
 * Documents Adapter — Resolve document references from main DB
 */

import { getDb } from "../../db/connection";

export async function resolveDocumentName(documentId: number): Promise<string> {
  try {
    const db = getDb();
    if (!db) return `Document #${documentId}`;
    const result = await db.execute(
      `SELECT title FROM documents WHERE id = ${documentId} LIMIT 1`
    );
    const row = (result as any)?.[0];
    return row?.title || `Document #${documentId}`;
  } catch {
    return `Document #${documentId}`;
  }
}
