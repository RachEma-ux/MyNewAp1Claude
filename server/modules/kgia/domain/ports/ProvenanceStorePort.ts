/**
 * Port: Provenance Store — abstract interface for provenance chain persistence.
 * Follows PROV-O style: entities, activities, agents, derivations.
 */
import type { ProvenanceRef } from "../types";

export interface ProvenanceRecord {
  runId: number;
  refs: ProvenanceRef[];
  generatedAt: Date;
  actorId?: number;
}

export interface ProvenanceStorePort {
  /** Persist provenance chain for a run */
  persist(record: ProvenanceRecord): Promise<void>;

  /** Load provenance chain for a run */
  load(runId: number): Promise<ProvenanceRecord | null>;

  /** Query provenance by source ref */
  findBySource(sourceRef: string, workspaceId: number): Promise<ProvenanceRecord[]>;
}
