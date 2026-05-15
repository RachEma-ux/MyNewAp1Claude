/**
 * Canvas node update/delete — V1+ Phase 17-γ follow-up. PR-V1-169.
 *
 * The 17-γ events sink + persistence + drain chain (#792 → #812)
 * shipped the `canvas.note_reference_removed` event kind but no
 * caller existed for it — canvas-service had only `createCanvasNode`,
 * not update/delete. This PR adds those callers + lights up the
 * `_removed` event path AND closes the update-time
 * `_changed` path (note reference swap on an existing node).
 *
 * Tests are source-scan because the service-layer behavior is best
 * verified by ASDB integration (not exercised on device per
 * CLAUDE.md). The structural assertions verify:
 *   - The new exports exist on the service + barrel.
 *   - The update path covers all 4 referencedNoteId diff cases
 *     (null→X, X→Y, X→null, X→X) with the correct event emission.
 *   - The delete path emits `_removed` when the deleted node
 *     carried a referencedNoteId; idempotent on missing rows.
 *   - Same canvas→vault→workspace split-handle routing as
 *     createCanvasNode.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("V1+ PR-V1-169 — canvas node update/delete + projection event emission", () => {
  const svcFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-service.ts",
  );
  const typesFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/types.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/public-api.ts",
  );

  it("types declares UpdateCanvasNodeInput + CanvasNodeNotFoundError", () => {
    const src = readFileSync(typesFile, "utf8");
    expect(/export\s+interface\s+UpdateCanvasNodeInput/.test(src)).toBe(true);
    expect(/export\s+class\s+CanvasNodeNotFoundError/.test(src)).toBe(true);
    // referencedNoteId is `number | null | undefined` distinguished:
    // undefined = leave alone; null = clear.
    expect(/referencedNoteId\?:\s*number\s*\|\s*null/.test(src)).toBe(true);
  });

  it("canvas-service exports updateCanvasNode + deleteCanvasNode", () => {
    const src = readFileSync(svcFile, "utf8");
    expect(/export\s+async\s+function\s+updateCanvasNode/.test(src)).toBe(true);
    expect(/export\s+async\s+function\s+deleteCanvasNode/.test(src)).toBe(true);
  });

  it("updateCanvasNode pre-fetches the prior row before the workspace lookup", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function updateCanvasNode"),
      src.indexOf("export async function deleteCanvasNode"),
    );
    expect(body).toContain("priorRows = await lookupDb");
    expect(body).toContain("CanvasNodeNotFoundError(input.nodeId)");
    // Same canvas→workspace resolver as createCanvasNode.
    expect(body).toContain("resolveWorkspaceIdForCanvas(lookupDb, prior.canvasId)");
  });

  it("updateCanvasNode emits _changed when the note reference is added or swapped", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function updateCanvasNode"),
      src.indexOf("export async function deleteCanvasNode"),
    );
    expect(body).toContain('kind: "canvas.note_reference_changed"');
    expect(body).toContain("referencedNoteId: after");
  });

  it("updateCanvasNode emits _removed when the note reference is cleared", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function updateCanvasNode"),
      src.indexOf("export async function deleteCanvasNode"),
    );
    expect(body).toContain('kind: "canvas.note_reference_removed"');
    expect(body).toContain("priorReferencedNoteId: before");
  });

  it("updateCanvasNode no-event path when referencedNoteId unchanged", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function updateCanvasNode"),
      src.indexOf("export async function deleteCanvasNode"),
    );
    // Only emit when before !== after.
    expect(/if\s*\(\s*before\s*!==\s*after\s*\)/.test(body)).toBe(true);
  });

  it("updateCanvasNode no-op patch returns prior without round-trip", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function updateCanvasNode"),
      src.indexOf("export async function deleteCanvasNode"),
    );
    expect(/Object\.keys\(patch\)\.length\s*===\s*0/.test(body)).toBe(true);
    expect(/return\s+prior\s*;/.test(body)).toBe(true);
  });

  it("deleteCanvasNode is idempotent on missing rows + emits _removed when ref existed", () => {
    const src = readFileSync(svcFile, "utf8");
    const body = src.slice(
      src.indexOf("export async function deleteCanvasNode"),
      src.indexOf("export async function createCanvasEdge"),
    );
    // Returns false when no prior row.
    expect(/if\s*\(\s*!priorRows\[0\]\s*\)\s*return\s+false/.test(body)).toBe(
      true,
    );
    // Emits _removed when the deleted node carried a referencedNoteId.
    expect(body).toContain('kind: "canvas.note_reference_removed"');
    expect(/prior\.referencedNoteId\s*!=\s*null/.test(body)).toBe(true);
    expect(/return\s+true\s*;/.test(body)).toBe(true);
  });

  it("public-api barrel re-exports the new symbols", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("UpdateCanvasNodeInput");
    expect(src).toContain("CanvasNodeNotFoundError");
    expect(src).toContain("updateCanvasNode");
    expect(src).toContain("deleteCanvasNode");
  });

  it("hard-rule compliance on the modified files", () => {
    for (const file of [svcFile, typesFile, barrelFile]) {
      const src = readFileSync(file, "utf8");
      expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
      expect(/credential-resolver/.test(src)).toBe(false);
      expect(/dispatchMcpToolCall/.test(src)).toBe(false);
      expect(/neo4j-driver/.test(src)).toBe(false);
    }
  });
});
