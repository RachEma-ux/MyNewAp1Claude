/**
 * Code Graph services public-api barrel — T-G.2.1.
 *
 * Single re-export point for all production code-graph surfaces:
 *   - contracts:    closed-taxonomy node/edge types + validators
 *   - parser:       file-text → ParsedCodeNode[] + ParsedCodeEdge[]
 *   - persistence:  Postgres ASDB store (source of truth)
 *   - projection:   Neo4j derived projection via GraphRepository
 *
 * NOT re-exported: `spike/`. The spike directory is a frozen
 * measurement reference per T-E (see `spike/README.md`) and must
 * not be imported by production code.
 */

export * from "./contracts/public-api.js";
export * from "./parser/public-api.js";
export * from "./persistence/public-api.js";
export * from "./projection/public-api.js";
export * from "./orchestrator/public-api.js";
