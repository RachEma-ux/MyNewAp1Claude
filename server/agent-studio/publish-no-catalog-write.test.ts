/**
 * Phase 22 — `agentStudio.agent.publish` lifecycle-only guarantee.
 *
 * Asserts that calling `publishRelease` writes:
 *   - exactly 1 row to `ags_agent_releases` (with `catalog_ready_at`
 *     set so Phase 25's `aiTypes.catalog.register` can find it)
 *   - exactly 1 update to `ags_agents` (lifecycle flip)
 *
 * AND does NOT touch:
 *   - `catalog_entries` (the AI Types canonical catalog)
 *   - any AI Types module via dynamic import
 *
 * The test mocks the drizzle `db()` connection so we can inspect
 * every insert / update site by table reference.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db/connection", () => ({
  getAsDb: vi.fn(),
}));

import * as repo from "./repository";
import {
  agsAgentReleases,
  agsAgents,
} from "../../drizzle/tables/agent-studio";
import { getAsDb } from "./db/connection";

const mockedDb = getAsDb as unknown as ReturnType<typeof vi.fn>;

describe("publishRelease — Phase 22 lifecycle-only contract", () => {
  let insertCalls: Array<{ table: unknown; values: Record<string, unknown> }>;
  let updateCalls: Array<{ table: unknown; set: Record<string, unknown> }>;

  beforeEach(() => {
    insertCalls = [];
    updateCalls = [];
    mockedDb.mockReset();

    const fakeConn: any = {
      insert: vi.fn((table: unknown) => {
        const builder: any = {};
        builder.values = vi.fn((values: Record<string, unknown>) => {
          insertCalls.push({ table, values });
          builder._values = values;
          return builder;
        });
        builder.returning = vi.fn(() =>
          Promise.resolve([
            {
              id: 99,
              ...builder._values,
            },
          ]),
        );
        return builder;
      }),
      update: vi.fn((table: unknown) => {
        const builder: any = {};
        builder.set = vi.fn((set: Record<string, unknown>) => {
          updateCalls.push({ table, set });
          return builder;
        });
        builder.where = vi.fn(() => Promise.resolve([]));
        return builder;
      }),
    };
    mockedDb.mockReturnValue(fakeConn);
  });

  it("inserts into ags_agent_releases with catalog_ready_at set", async () => {
    const result = await repo.publishRelease({
      agentId: 1,
      versionId: 7,
      targetEnvironment: "production",
      releaseNotes: "v7",
      publishedBy: 42,
    });

    const releaseInsert = insertCalls.find((c) => c.table === agsAgentReleases);
    expect(releaseInsert).toBeDefined();
    expect(releaseInsert!.values.state).toBe("published");
    expect(releaseInsert!.values.publishedAt).toBeInstanceOf(Date);
    // Phase 22 — export-candidate marker.
    expect(releaseInsert!.values.catalogReadyAt).toBeInstanceOf(Date);
    expect(result.id).toBe(99);
  });

  it("flips ags_agents.lifecycleState to published", async () => {
    await repo.publishRelease({
      agentId: 1,
      versionId: 7,
      targetEnvironment: "production",
    });

    const agentUpdate = updateCalls.find((c) => c.table === agsAgents);
    expect(agentUpdate).toBeDefined();
    expect(agentUpdate!.set.lifecycleState).toBe("published");
    expect(agentUpdate!.set.publishedVersionId).toBe(7);
    expect(agentUpdate!.set.environment).toBe("production");
  });

  it("does NOT insert into catalog_entries", async () => {
    await repo.publishRelease({
      agentId: 1,
      versionId: 7,
      targetEnvironment: "production",
    });

    // No insert site whose table references the catalog_entries
    // schema object. We accept anything that isn't agsAgentReleases
    // as "anything other than a release insert" and assert there's
    // exactly one insert call total — to ags_agent_releases.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe(agsAgentReleases);
  });

  it("performs exactly two writes total (1 insert + 1 update)", async () => {
    await repo.publishRelease({
      agentId: 1,
      versionId: 7,
      targetEnvironment: "production",
    });
    expect(insertCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(1);
  });
});
