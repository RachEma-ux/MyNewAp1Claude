/**
 * Phase G §T-G.60 — `summarizeCommandRegistry` lockstep.
 *
 * Stable-shape registry aggregator over the command registry. Mirrors
 * the registry-half of the lesson-30 aggregator pair pattern. The
 * row-half (operator-invocation audit aggregator) is a future slice
 * once the `command_invocations` table ships.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  COMMAND_SCOPES,
  _resetCommandRegistryForTests,
  registerCommand,
  summarizeCommandRegistry,
} from "../../server/agent-studio/services/command-registry/public-api.js";

afterEach(() => {
  _resetCommandRegistryForTests();
});

describe("summarizeCommandRegistry — empty registry", () => {
  it("zero on every axis on cold boot", () => {
    const s = summarizeCommandRegistry();
    expect(s.total).toBe(0);
    expect(s.moduleCount).toBe(0);
    expect(s.noModuleCount).toBe(0);
    expect(s.byModule).toEqual({});
  });

  it("byScope carries every closed scope at 0 (stable shape)", () => {
    const s = summarizeCommandRegistry();
    for (const scope of COMMAND_SCOPES) {
      expect(s.byScope[scope]).toBe(0);
    }
  });
});

describe("summarizeCommandRegistry — populated registry", () => {
  it("counts single registration on the correct scope axis", () => {
    registerCommand({
      commandKey: "vault.create-note",
      title: "Create Note",
      scope: "write",
      target: "trpc:agentStudio.vault.createNote",
      module: "vault",
    });
    const s = summarizeCommandRegistry();
    expect(s.total).toBe(1);
    expect(s.byScope.write).toBe(1);
    expect(s.byScope.read).toBe(0);
    expect(s.byScope.destructive).toBe(0);
    expect(s.byModule.vault).toBe(1);
    expect(s.moduleCount).toBe(1);
    expect(s.noModuleCount).toBe(0);
  });

  it("counts each scope correctly across mixed registrations", () => {
    registerCommand({
      commandKey: "vault.read-note",
      title: "Read",
      scope: "read",
      target: "ui:open-note",
      module: "vault",
    });
    registerCommand({
      commandKey: "vault.create-note",
      title: "Create",
      scope: "write",
      target: "trpc:vault.create",
      module: "vault",
    });
    registerCommand({
      commandKey: "vault.delete-note",
      title: "Delete",
      scope: "destructive",
      target: "trpc:vault.delete",
      module: "vault",
    });
    const s = summarizeCommandRegistry();
    expect(s.byScope.read).toBe(1);
    expect(s.byScope.write).toBe(1);
    expect(s.byScope.destructive).toBe(1);
    expect(s.total).toBe(3);
  });

  it("module axis is sparse — only registered modules show up", () => {
    registerCommand({
      commandKey: "a",
      title: "A",
      scope: "read",
      target: "ui:a",
      module: "vault",
    });
    registerCommand({
      commandKey: "b",
      title: "B",
      scope: "read",
      target: "ui:b",
      module: "runtime",
    });
    const s = summarizeCommandRegistry();
    expect(s.byModule.vault).toBe(1);
    expect(s.byModule.runtime).toBe(1);
    // `byModule` should NOT contain unregistered module names.
    expect(s.byModule.never_registered).toBeUndefined();
    expect(s.moduleCount).toBe(2);
  });

  it("noModuleCount tracks commands without a module field", () => {
    registerCommand({
      commandKey: "orphan-1",
      title: "Orphan 1",
      scope: "read",
      target: "ui:o1",
    });
    registerCommand({
      commandKey: "vault.a",
      title: "A",
      scope: "read",
      target: "ui:a",
      module: "vault",
    });
    registerCommand({
      commandKey: "orphan-2",
      title: "Orphan 2",
      scope: "read",
      target: "ui:o2",
    });
    const s = summarizeCommandRegistry();
    expect(s.noModuleCount).toBe(2);
    expect(s.moduleCount).toBe(1);
    expect(s.total).toBe(3);
  });

  it("multiple commands in same module bucket together", () => {
    registerCommand({
      commandKey: "vault.a",
      title: "A",
      scope: "read",
      target: "ui:a",
      module: "vault",
    });
    registerCommand({
      commandKey: "vault.b",
      title: "B",
      scope: "write",
      target: "ui:b",
      module: "vault",
    });
    registerCommand({
      commandKey: "vault.c",
      title: "C",
      scope: "destructive",
      target: "ui:c",
      module: "vault",
    });
    const s = summarizeCommandRegistry();
    expect(s.byModule.vault).toBe(3);
    expect(s.moduleCount).toBe(1);
  });
});

describe("summarizeCommandRegistry — axis invariants", () => {
  it("byScope sums to total across every registration", () => {
    registerCommand({
      commandKey: "x1",
      title: "X1",
      scope: "read",
      target: "ui:x1",
    });
    registerCommand({
      commandKey: "x2",
      title: "X2",
      scope: "write",
      target: "ui:x2",
    });
    const s = summarizeCommandRegistry();
    let sum = 0;
    for (const scope of COMMAND_SCOPES) sum += s.byScope[scope];
    expect(sum).toBe(s.total);
  });

  it("moduleCount + noModuleCount sums to total", () => {
    registerCommand({
      commandKey: "orphan",
      title: "Orphan",
      scope: "read",
      target: "ui:o",
    });
    registerCommand({
      commandKey: "a.x",
      title: "Ax",
      scope: "read",
      target: "ui:ax",
      module: "a",
    });
    registerCommand({
      commandKey: "a.y",
      title: "Ay",
      scope: "read",
      target: "ui:ay",
      module: "a",
    });
    const s = summarizeCommandRegistry();
    let moduleCommandTotal = 0;
    for (const k of Object.keys(s.byModule)) moduleCommandTotal += s.byModule[k];
    expect(moduleCommandTotal + s.noModuleCount).toBe(s.total);
  });
});
