/**
 * Extensions uninstall — PR-V1-179.
 *
 * Adds a hard-delete uninstall path distinct from `setStatus(...,
 * "revoked")` which preserves the row for audit. Source-scan covers
 * service / router / barrel / UI wiring.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-179 — extensions uninstall (hard delete)", () => {
  const manifest = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/extensions-admin-router.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/public-api.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("manifest.ts exports uninstallExtension that DELETEs the row + idempotent", () => {
    const src = readFileSync(manifest, "utf8");
    expect(/export\s+async\s+function\s+uninstallExtension/.test(src)).toBe(
      true,
    );
    const body = src.slice(
      src.indexOf("export async function uninstallExtension"),
      src.indexOf("export async function listExtensionsByWorkspace"),
    );
    expect(/db\.delete\(\s*agsExtensions\s*\)/.test(body)).toBe(true);
    // Idempotent: returns false on no-match.
    expect(/if\s*\(\s*lookup\.length\s*===\s*0\s*\)\s*return\s+false/.test(body)).toBe(
      true,
    );
    expect(/return\s+true\s*;/.test(body)).toBe(true);
  });

  it("PR-V1-180: uninstallExtension cascade-deletes agsExtensionInvocations BEFORE the parent row", () => {
    const src = readFileSync(manifest, "utf8");
    // Import added.
    expect(src).toContain("agsExtensionInvocations");
    const body = src.slice(
      src.indexOf("export async function uninstallExtension"),
      src.indexOf("export async function listExtensionsByWorkspace"),
    );
    // The cascade delete on agsExtensionInvocations must appear and
    // must precede the parent delete on agsExtensions (otherwise the
    // FK from invocations.extensionId blocks the parent delete).
    const invIdx = body.indexOf("db\n    .delete(agsExtensionInvocations)");
    const parentIdx = body.indexOf("db.delete(agsExtensions)");
    expect(invIdx).toBeGreaterThan(-1);
    expect(parentIdx).toBeGreaterThan(-1);
    expect(invIdx).toBeLessThan(parentIdx);
    expect(
      /eq\(\s*agsExtensionInvocations\.extensionId\s*,\s*extensionId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("barrel re-exports uninstallExtension", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("uninstallExtension");
  });

  it("router exposes uninstall as adminProcedure.mutation with { removed } shape", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("uninstallExtension");
    expect(/uninstall:\s*adminProcedure[\s\S]{0,400}\.mutation\(/.test(src)).toBe(
      true,
    );
    expect(/removed:\s*await\s+uninstallExtension\(input\.extensionId\)/.test(src)).toBe(
      true,
    );
  });

  it("UI panel wires the uninstall mutation with a confirm() gate", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.uninstall.useMutation",
    );
    expect(/window\.confirm\(/.test(src)).toBe(true);
    expect(
      /uninstallMutation\.mutate\(\{\s*extensionId:\s*ext\.id\s*\}\)/.test(src),
    ).toBe(true);
  });

  it("uninstall button disabled while mutation pending", () => {
    const src = readFileSync(panel, "utf8");
    expect(/disabled=\{\s*uninstallMutation\.isPending\s*\}/.test(src)).toBe(
      true,
    );
  });

  it("hard-rule compliance on the modified manifest.ts paths", () => {
    const src = readFileSync(manifest, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
