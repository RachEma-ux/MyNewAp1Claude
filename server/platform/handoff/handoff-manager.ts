/**
 * Handoff Manager
 *
 * In-memory MVP. Persistence layer (`platform_handoffs` table) is opt-in
 * via `setHandoffStore` so existing app DBs don't require a migration on
 * day one. The Coordinator and Module Gateway depend only on the API
 * defined here.
 *
 * Handoffs are deliberately separate from Events:
 *   - Event = "something happened, anyone interested can react".
 *   - Handoff = "I am asking THIS specific module to OWN this work".
 *
 * Use a handoff for `PS → PM Central`. Do not coordinate.
 */

import { randomUUID } from "crypto";
import type {
  Handoff,
  HandoffAcceptor,
  HandoffStatus,
  SubmitHandoffInput,
} from "./types";

export interface HandoffStore {
  insert(h: Handoff): Promise<void>;
  update(handoffId: string, patch: Partial<Handoff>): Promise<void>;
  get(handoffId: string): Promise<Handoff | null>;
  list(filter?: { workspaceId?: number | string; status?: HandoffStatus }): Promise<Handoff[]>;
}

class InMemoryStore implements HandoffStore {
  private map = new Map<string, Handoff>();
  async insert(h: Handoff) {
    this.map.set(h.handoffId, h);
  }
  async update(id: string, patch: Partial<Handoff>) {
    const prev = this.map.get(id);
    if (!prev) return;
    this.map.set(id, { ...prev, ...patch, updatedAt: new Date().toISOString() });
  }
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async list(filter?: { workspaceId?: number | string; status?: HandoffStatus }) {
    return [...this.map.values()].filter((h) => {
      if (filter?.workspaceId !== undefined && h.workspaceId !== filter.workspaceId) return false;
      if (filter?.status && h.status !== filter.status) return false;
      return true;
    });
  }
}

let _store: HandoffStore = new InMemoryStore();
export function setHandoffStore(store: HandoffStore) {
  _store = store;
}

const acceptors = new Map<string, HandoffAcceptor>();

/** A receiving module registers an acceptor for a (toModule, type) tuple. */
export function registerHandoffAcceptor(
  toModule: string,
  type: string,
  acceptor: HandoffAcceptor,
) {
  const key = `${toModule}::${type}`;
  acceptors.set(key, acceptor);
}

export async function submitHandoff(input: SubmitHandoffInput): Promise<Handoff> {
  if (input.fromModule === input.toModule) {
    throw new Error(
      `[handoff] fromModule and toModule must differ ('${input.fromModule}')`,
    );
  }
  const now = new Date().toISOString();
  const handoff: Handoff = {
    handoffId: randomUUID(),
    fromModule: input.fromModule,
    toModule: input.toModule,
    type: input.type,
    payload: input.payload,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    correlationId: input.correlationId ?? randomUUID(),
    governanceReceipt: input.governanceReceipt,
    status: "submitted",
    callbackUrl: input.callbackUrl,
    createdAt: now,
    updatedAt: now,
  };
  await _store.insert(handoff);

  // Dispatch to acceptor (in-memory MVP)
  const acceptor = acceptors.get(`${input.toModule}::${input.type}`);
  if (acceptor) {
    try {
      const result = await acceptor(handoff);
      if (result.accepted) {
        await _store.update(handoff.handoffId, { status: "accepted" });
        handoff.status = "accepted";
      } else {
        await _store.update(handoff.handoffId, {
          status: "rejected",
          failureReason: result.reason,
        });
        handoff.status = "rejected";
        handoff.failureReason = result.reason;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await _store.update(handoff.handoffId, { status: "failed", failureReason: msg });
      handoff.status = "failed";
      handoff.failureReason = msg;
    }
  }
  return handoff;
}

export async function transitionHandoff(
  handoffId: string,
  status: HandoffStatus,
  patch?: { failureReason?: string },
): Promise<void> {
  const updates: Partial<Handoff> = { status };
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.completedAt = new Date().toISOString();
  }
  if (patch?.failureReason) updates.failureReason = patch.failureReason;
  await _store.update(handoffId, updates);
}

export async function getHandoff(handoffId: string): Promise<Handoff | null> {
  return _store.get(handoffId);
}

export async function listHandoffs(filter?: {
  workspaceId?: number | string;
  status?: HandoffStatus;
}): Promise<Handoff[]> {
  return _store.list(filter);
}

/** Test-only — clears the in-memory state. */
export function __resetHandoffsForTests(): void {
  _store = new InMemoryStore();
  acceptors.clear();
}
