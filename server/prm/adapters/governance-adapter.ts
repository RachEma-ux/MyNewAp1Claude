/**
 * Governance Adapter — Check freeze state from main DB governance center
 */

import { getDb } from "../../db/connection";

export async function isGovernanceFreezeActive(): Promise<boolean> {
  try {
    const db = getDb();
    if (!db) return false;
    const result = await db.execute(
      `SELECT count(*)::int as cnt FROM governance_freezes WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`
    );
    const row = (result as any)?.[0];
    return (row?.cnt || 0) > 0;
  } catch {
    return false;
  }
}
