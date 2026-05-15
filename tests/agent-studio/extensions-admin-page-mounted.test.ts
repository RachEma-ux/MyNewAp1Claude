/**
 * Extensions admin page mount source-scan — V1+ Phase 18 follow-up.
 * PR-V1-163.
 *
 * Verifies the page + panel exist, the panel queries the list
 * procedure shipped in #913, and AgentStudioShell wires the route.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Phase 18 follow-up — extensions admin page mount", () => {
  const pageFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/ExtensionsAdminPage.tsx",
  );
  const panelFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );
  const shellFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );

  it("page mounts the panel + accepts optional workspaceId (default 1)", () => {
    const src = readFileSync(pageFile, "utf8");
    expect(src).toContain(
      'import { ExtensionsAdminPanel } from "../components/ExtensionsAdminPanel"',
    );
    expect(/<ExtensionsAdminPanel\s+workspaceId=\{workspaceId\}\s*\/>/.test(src)).toBe(
      true,
    );
    expect(/workspaceId\s*=\s*1\s*\}/.test(src)).toBe(true);
  });

  it("panel queries extensions.list with workspaceId", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.list.useQuery",
    );
    expect(/\{\s*workspaceId\s*\}/.test(src)).toBe(true);
  });

  it("panel renders governance status badge with class mapping", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(/function\s+statusBadgeClass/.test(src)).toBe(true);
    expect(src).toContain('case "approved":');
    expect(src).toContain('case "pending_approval":');
    expect(src).toContain('case "rejected":');
    expect(src).toContain('case "revoked":');
    expect(src).toContain('case "disabled":');
  });

  it("AgentStudioShell lazy-imports the page", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(
      /const\s+ExtensionsAdminPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("\.\.\/pages\/ExtensionsAdminPage"\)\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("AgentStudioShell registers the /extensions-admin route + dispatch", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(src).toContain('path.startsWith("/agent-studio/extensions-admin")');
    expect(src).toContain('view: "extensions-admin" as any');
    expect(
      /case\s+"extensions-admin"\s+as\s+any:\s*\n\s*return\s+<ExtensionsAdminPage\s*\/>/.test(
        src,
      ),
    ).toBe(true);
  });
});
