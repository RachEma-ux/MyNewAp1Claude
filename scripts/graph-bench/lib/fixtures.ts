/**
 * Graph Backend Benchmark Harness — fixture generator.
 *
 * Phase 1.4. Generates a deterministic 10k-note / 100k-link / 50k-node /
 * 250k-edge fixture in the active graph backend via GraphRepository.
 *
 * Deterministic seeding (no random) so subsequent runs against the same
 * backend yield identical fixtures.
 */

import type { GraphRepository } from "../../../server/agent-studio/services/graph/repository/index.js";

export interface FixtureSpec {
  readonly notes: number;
  readonly links: number;
  readonly nodes: number;
  readonly edges: number;
}

export const DEFAULT_FIXTURE: FixtureSpec = {
  notes: 10_000,
  links: 100_000,
  nodes: 50_000,
  edges: 250_000,
};

export async function generateFixture(repo: GraphRepository, spec: FixtureSpec = DEFAULT_FIXTURE): Promise<void> {
  // Generate Note nodes
  for (let i = 0; i < spec.notes; i++) {
    await repo.upsertNode({
      typeKey: "Note",
      id: `note:${i}`,
      sourceId: String(i),
      properties: { title: `Note ${i}`, vaultId: 1 },
      provenance: {
        sourceType: "vault_note",
        sourceId: String(i),
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });
  }

  // Generate Entity nodes
  for (let i = 0; i < spec.nodes - spec.notes; i++) {
    await repo.upsertNode({
      typeKey: "Entity",
      id: `entity:${i}`,
      sourceId: String(i),
      properties: { label: `Entity ${i}` },
      provenance: {
        sourceType: "kgra_entity",
        sourceId: String(i),
        lineageStatus: "derived",
        governanceStatus: "active",
      },
    });
  }

  // Generate LINKS_TO edges (each note linked to ~10 others)
  for (let i = 0; i < spec.links; i++) {
    const src = i % spec.notes;
    const tgt = (i * 17 + 3) % spec.notes;
    if (src === tgt) continue;
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: `link:${i}`,
      sourceNode: { typeKey: "Note", id: `note:${src}` },
      targetNode: { typeKey: "Note", id: `note:${tgt}` },
      properties: {},
      provenance: {
        sourceType: "vault_wikilink",
        sourceId: String(i),
        lineageStatus: "derived",
        governanceStatus: "active",
      },
    });
  }

  // Generate MENTIONS edges (note → entity)
  for (let i = 0; i < spec.edges - spec.links; i++) {
    const noteIdx = i % spec.notes;
    const entIdx = i % (spec.nodes - spec.notes);
    await repo.upsertEdge({
      typeKey: "MENTIONS",
      id: `mention:${i}`,
      sourceNode: { typeKey: "Note", id: `note:${noteIdx}` },
      targetNode: { typeKey: "Entity", id: `entity:${entIdx}` },
      properties: {},
      provenance: {
        sourceType: "kgra_extraction",
        sourceId: String(i),
        lineageStatus: "derived",
        governanceStatus: "active",
      },
    });
  }
}
