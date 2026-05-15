/**
 * MR-3 thirty-sixth batch — services/region/draft-workspace-resolver.ts
 * Path-B primitive for the agent-tier schema gap (SOTU rev 2 §11).
 * PR-V1-106.
 *
 * Tests the new `resolveWorkspaceIdForDraft(db, draftId)` helper that
 * derives a draft's workspaceId via the `agsAgentProviderBindings`
 * escape hatch. The helper is unit-level testable — pass a stub db
 * without booting ASDB.
 */

import { describe, expect, it, vi } from "vitest";

import { resolveWorkspaceIdForDraft } from "../../server/agent-studio/services/region/draft-workspace-resolver";

function makeStubDb(rows: { workspaceId: number }[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  } as never;
}

describe("MR-3 thirty-sixth batch — resolveWorkspaceIdForDraft", () => {
  it("returns workspaceId when the draft has at least one binding", async () => {
    const db = makeStubDb([{ workspaceId: 42 }]);
    const result = await resolveWorkspaceIdForDraft(db, 7);
    expect(result).toBe(42);
  });

  it("returns null when no binding exists for the draft (legacy / unbound)", async () => {
    const db = makeStubDb([]);
    const result = await resolveWorkspaceIdForDraft(db, 999);
    expect(result).toBeNull();
  });

  it("returns null when the binding row has a null workspaceId (defensive — schema says NOT NULL but cope)", async () => {
    const db = makeStubDb([{ workspaceId: null as unknown as number }]);
    const result = await resolveWorkspaceIdForDraft(db, 7);
    expect(result).toBeNull();
  });

  it("limits to at-most-one row (Phase-2 invariant: all bindings for a draft share workspace)", async () => {
    let limitArg: number | undefined;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (n: number) => {
              limitArg = n;
              return Promise.resolve([{ workspaceId: 1 }]);
            },
          }),
        }),
      }),
    } as never;
    await resolveWorkspaceIdForDraft(db, 7);
    expect(limitArg).toBe(1);
  });
});
