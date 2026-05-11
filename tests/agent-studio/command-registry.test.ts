/**
 * Phase 18 — Internal command registry tests.
 *
 * Covers `services/command-registry/command-registry.ts`. Pure
 * in-memory registry; no DB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCommand,
  getCommand,
  listCommands,
  CommandKeyConflictError,
  _resetCommandRegistryForTests,
} from "../../server/agent-studio/services/command-registry/command-registry";

beforeEach(() => {
  _resetCommandRegistryForTests();
});

describe("Internal command registry — Phase 18", () => {
  it("registerCommand inserts a command retrievable by key", () => {
    registerCommand({
      commandKey: "vault.create-note",
      title: "Create Note",
      scope: "write",
      target: "trpc:agentStudio.vault.createNote",
      module: "vault",
    });
    const got = getCommand("vault.create-note");
    expect(got).not.toBeNull();
    expect(got!.title).toBe("Create Note");
    expect(got!.scope).toBe("write");
  });

  it("getCommand returns null for unknown keys", () => {
    expect(getCommand("does-not-exist")).toBeNull();
  });

  it("registerCommand throws CommandKeyConflictError on duplicate key", () => {
    registerCommand({
      commandKey: "x",
      title: "X",
      scope: "read",
      target: "ui:noop",
    });
    expect(() =>
      registerCommand({
        commandKey: "x",
        title: "X again",
        scope: "read",
        target: "ui:noop",
      }),
    ).toThrow(CommandKeyConflictError);
  });

  it("listCommands returns all registered commands sorted by commandKey", () => {
    registerCommand({
      commandKey: "b",
      title: "B",
      scope: "read",
      target: "ui:b",
    });
    registerCommand({
      commandKey: "a",
      title: "A",
      scope: "read",
      target: "ui:a",
    });
    registerCommand({
      commandKey: "c",
      title: "C",
      scope: "read",
      target: "ui:c",
    });
    const cmds = listCommands();
    expect(cmds.map((c) => c.commandKey)).toEqual(["a", "b", "c"]);
  });

  it("listCommands({ module }) filters by module", () => {
    registerCommand({
      commandKey: "v1",
      title: "V1",
      scope: "read",
      target: "ui:v1",
      module: "vault",
    });
    registerCommand({
      commandKey: "g1",
      title: "G1",
      scope: "read",
      target: "ui:g1",
      module: "graph",
    });
    const vaultCmds = listCommands({ module: "vault" });
    expect(vaultCmds.length).toBe(1);
    expect(vaultCmds[0].commandKey).toBe("v1");
  });

  it("listCommands({ scope }) filters by scope", () => {
    registerCommand({
      commandKey: "r",
      title: "R",
      scope: "read",
      target: "ui:r",
    });
    registerCommand({
      commandKey: "w",
      title: "W",
      scope: "write",
      target: "ui:w",
    });
    registerCommand({
      commandKey: "d",
      title: "D",
      scope: "destructive",
      target: "ui:d",
    });
    const destructive = listCommands({ scope: "destructive" });
    expect(destructive.length).toBe(1);
    expect(destructive[0].commandKey).toBe("d");
  });

  it("`_resetCommandRegistryForTests` clears every prior registration", () => {
    registerCommand({
      commandKey: "x",
      title: "X",
      scope: "read",
      target: "ui:x",
    });
    expect(listCommands().length).toBe(1);
    _resetCommandRegistryForTests();
    expect(listCommands().length).toBe(0);
  });
});
