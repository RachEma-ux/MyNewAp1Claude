/**
 * F4 (2026-05-22) — `agentStudio.graphLens.render` must short-circuit
 * with a `workspace_not_found` envelope when the operator-supplied
 * `workspaceId` does not match any row in the `workspaces` table.
 *
 * The companion `graph-lens-router.test.ts` exercises the no-DB
 * fall-through path (it never mocks `getDb`); these cases mock the
 * connection module so we can drive workspace-exists / not-exists
 * deterministically.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResult: [] as Array<{ id: number }>,
  fakeDbProvided: true,
}));

vi.mock("../../server/db/connection", () => ({
  getDb: () =>
    state.fakeDbProvided
      ? {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve(state.selectResult),
              }),
            }),
          }),
        }
      : null,
}));

import { graphLensRouter } from "../../server/agent-studio/services/graph-lens/graph-lens-router";
import {
  __resetGraphLensRegistryForTests,
  __resetLensRunnerRegistryForTests,
  createRuntimeLensRunner,
  maybeInstallDefaultGraphLenses,
  registerLensRunner,
  type RuntimeLensReadFn,
} from "../../server/agent-studio/services/graph-lens/public-api";

const ADMIN_CTX = { user: { id: 42, role: "admin" } } as never;

const READ_EMPTY: RuntimeLensReadFn = async () => ({
  runs: [],
  agentsById: new Map(),
  truncated: false,
});

function installRuntimeRunner(): string {
  registerLensRunner(
    "runtime",
    createRuntimeLensRunner({ read: READ_EMPTY, now: () => new Date("2026-05-22") }),
  );
  return "runtime_default";
}

beforeEach(() => {
  __resetGraphLensRegistryForTests();
  __resetLensRunnerRegistryForTests();
  maybeInstallDefaultGraphLenses({
    env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
  });
  state.selectResult = [];
  state.fakeDbProvided = true;
});

describe("graphLensRouter.render — workspace existence check (F4)", () => {
  it("returns status='workspace_not_found' when the workspace row does not exist", async () => {
    const lensId = installRuntimeRunner();
    state.selectResult = [];

    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.render({ workspaceId: 9999, lensId });

    expect(result.status).toBe("workspace_not_found");
    if (result.status === "workspace_not_found") {
      expect(result.workspaceId).toBe(9999);
    }
  });

  it("returns status='ok' + snapshot when the workspace row exists", async () => {
    const lensId = installRuntimeRunner();
    state.selectResult = [{ id: 5 }];

    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.render({ workspaceId: 5, lensId });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.snapshot.kind).toBe("runtime");
    }
  });

  it("checks lensId BEFORE workspaceId — unknown lens returns 'not_found' regardless of workspace", async () => {
    state.selectResult = [];

    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.render({
      workspaceId: 9999,
      lensId: "this_lens_does_not_exist",
    });

    expect(result.status).toBe("not_found");
    if (result.status === "not_found") {
      expect(result.lensId).toBe("this_lens_does_not_exist");
    }
  });

  it("checks runner BEFORE workspaceId — kind without runner returns 'no_runner_for_kind'", async () => {
    state.selectResult = [];

    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const list = await caller.list();
    const ragLensId = list.find((e) => e.definition.kind === "rag")?.definition.id;
    expect(ragLensId).toBeDefined();

    const result = await caller.render({
      workspaceId: 9999,
      lensId: ragLensId!,
    });
    expect(result.status).toBe("no_runner_for_kind");
  });

  it("falls through to the runner when getDb() is unavailable (no-DB env preserved)", async () => {
    const lensId = installRuntimeRunner();
    state.fakeDbProvided = false; // simulate getDb() returning null

    const caller = graphLensRouter.createCaller(ADMIN_CTX);
    const result = await caller.render({ workspaceId: 9999, lensId });

    expect(result.status).toBe("ok");
  });
});
