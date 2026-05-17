/**
 * T-G.2.ε — Code Graph parser-error telemetry.
 *
 * Stacks on α (#1411) + β (#1412) + γ (#1413) + δ (#1414). Surfaces
 * audit-trail parser-error rows stored in ingestion
 * `metadata.parserErrors` (capped at 50 per ingestion at persistence
 * time) so operators can triage which files failed to parse without
 * loading the full metadata blob from drizzle.
 *
 * Two limit knobs:
 *   - `ingestionLimit` — how many recent ingestions to scan
 *   - `errorLimit` — total row cap across all scanned ingestions
 *
 * Both defaulted (20 / 100) and absolute-capped (200 / 500).
 *
 * Structural test only — DB-backed behavior covered by the store
 * integration tests.
 */

import { describe, it, expect } from "vitest";

import {
  codeGraphRouter,
  CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_INGESTION_LIMIT,
  CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_ERROR_LIMIT,
  CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_INGESTION_LIMIT,
  CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_ERROR_LIMIT,
  type CodeGraphRecentParserErrorsEnvelope,
} from "../../server/agent-studio/services/code-graph/code-graph-router";

describe("T-G.2.ε — codeGraphRouter.listRecentParserErrors shape", () => {
  it("router exposes listRecentParserErrors procedure", () => {
    const procedures = (codeGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRecentParserErrors");
    // Prior procedures still present.
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
    expect(keys).toContain("listRepositories");
    expect(keys).toContain("listKnownTypes");
  });

  it("default + absolute limit constants are sane", () => {
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_INGESTION_LIMIT).toBe(20);
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_ERROR_LIMIT).toBe(100);
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_INGESTION_LIMIT).toBe(200);
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_ERROR_LIMIT).toBe(500);
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_INGESTION_LIMIT).toBeLessThan(
      CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_INGESTION_LIMIT,
    );
    expect(CODE_GRAPH_RECENT_PARSER_ERRORS_DEFAULT_ERROR_LIMIT).toBeLessThan(
      CODE_GRAPH_RECENT_PARSER_ERRORS_ABSOLUTE_ERROR_LIMIT,
    );
  });

  it("envelope wraps an array of parser-error rows with ingestion context", () => {
    const env: CodeGraphRecentParserErrorsEnvelope = {
      errors: [
        {
          ingestionId: "demo-org/repo::2026-05-17T20:00Z",
          repositoryId: "demo-org/repo",
          filePath: "src/big-file.ts",
          reason: "file_too_large",
          message: "skipped: file is 250KB > 35KB tree-sitter limit",
          ingestionStartedAt: new Date("2026-05-17T20:00:00Z"),
        },
        {
          ingestionId: "demo-org/repo::2026-05-17T20:00Z",
          repositoryId: "demo-org/repo",
          filePath: "src/weird.exotic",
          reason: "unsupported_language",
          message: "no parser registered for .exotic",
          ingestionStartedAt: new Date("2026-05-17T20:00:00Z"),
        },
      ],
    };
    expect(env.errors.length).toBe(2);
    expect(env.errors[0]!.reason).toBe("file_too_large");
    expect(env.errors[1]!.reason).toBe("unsupported_language");
    // ingestionId + repositoryId attached for source-of-record context
    expect(env.errors[0]!.ingestionId).toBe(
      "demo-org/repo::2026-05-17T20:00Z",
    );
    expect(env.errors[0]!.repositoryId).toBe("demo-org/repo");
  });
});
