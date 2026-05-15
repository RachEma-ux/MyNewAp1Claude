/**
 * Canvas tRPC router mount + shape — V1+ Phase 17 closure. PR-V1-170.
 *
 * First external consumer of canvas-service via tRPC. Verifies:
 *   - Router imported + mounted at `canvas:` in the agent-studio router.
 *   - 9 expected procedures (4 queries + 5 mutations) declared with
 *     the right verb.
 *   - All inputs Zod-validated; closed taxonomy (`CANVAS_NODE_KINDS`)
 *     enforced via `z.enum`.
 *   - Mutations delegate to canvas-service helpers (no direct
 *     agsCanvases / agsCanvasNodes / agsCanvasEdges writes from the
 *     router).
 *   - Public-api barrel re-exports `canvasRouter`.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Phase 17 closure — canvas tRPC router mount + shape", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-router.ts",
  );
  const agentStudioRouterFile = resolve(
    __dirname,
    "../../server/agent-studio/api/router.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/public-api.ts",
  );

  it("agent-studio router imports + mounts canvasRouter at `canvas`", () => {
    const src = readFileSync(agentStudioRouterFile, "utf8");
    expect(src).toContain(
      'import { canvasRouter } from "../services/canvas/canvas-router"',
    );
    expect(/canvas:\s*canvasRouter\b/.test(src)).toBe(true);
  });

  it("router declares 9 expected procedures with protectedProcedure guard", () => {
    const src = readFileSync(routerFile, "utf8");
    const expected = [
      "get",
      "listByVault",
      "getSnapshot",
      "listNoteReferences",
      "create",
      "createNode",
      "updateNode",
      "deleteNode",
      "createEdge",
    ];
    for (const proc of expected) {
      expect(src).toContain(`${proc}: protectedProcedure`);
    }
  });

  it("mutations use .mutation; queries use .query", () => {
    const src = readFileSync(routerFile, "utf8");
    // Queries:
    for (const proc of ["get", "listByVault", "getSnapshot", "listNoteReferences"]) {
      const re = new RegExp(
        `${proc}:\\s*protectedProcedure[\\s\\S]{0,400}\\.query\\(`,
      );
      expect(re.test(src)).toBe(true);
    }
    // Mutations:
    for (const proc of [
      "create",
      "createNode",
      "updateNode",
      "deleteNode",
      "createEdge",
    ]) {
      const re = new RegExp(
        `${proc}:\\s*protectedProcedure[\\s\\S]{0,600}\\.mutation\\(`,
      );
      expect(re.test(src)).toBe(true);
    }
  });

  it("CANVAS_NODE_KINDS enforced via z.enum at the boundary", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain('import { z } from "zod"');
    expect(/CanvasNodeKindSchema\s*=\s*z\.enum\(CANVAS_NODE_KINDS\)/.test(src)).toBe(
      true,
    );
    // Both create + update node schemas use the enum.
    expect(/kind:\s*CanvasNodeKindSchema/.test(src)).toBe(true);
    expect(/kind:\s*CanvasNodeKindSchema\.optional\(\)/.test(src)).toBe(true);
  });

  it("mutations delegate to canvas-service (no direct table writes from the router)", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain("createCanvas(");
    expect(src).toContain("createCanvasNode(");
    expect(src).toContain("updateCanvasNode(");
    expect(src).toContain("deleteCanvasNode(");
    expect(src).toContain("createCanvasEdge(");
    // No direct drizzle imports / table touches in the router file.
    expect(/agsCanvases\b/.test(src)).toBe(false);
    expect(/agsCanvasNodes\b/.test(src)).toBe(false);
    expect(/agsCanvasEdges\b/.test(src)).toBe(false);
  });

  it("public-api barrel re-exports canvasRouter", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("./canvas-router.js");
    expect(src).toContain("canvasRouter");
  });

  it("hard-rule compliance on the router file", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("deleteNode returns the structured `{ removed: boolean }` shape", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/removed:\s*await\s+deleteCanvasNode\(input\.nodeId\)/.test(src)).toBe(
      true,
    );
  });
});
