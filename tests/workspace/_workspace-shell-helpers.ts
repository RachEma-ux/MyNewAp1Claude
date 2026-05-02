/**
 * Test helper: per-purpose workspace shells.
 *
 * Legacy `WorkspaceShell.tsx` / `WorkspaceHome.tsx` / `WorkspaceDetail.tsx`
 * were unified into three per-purpose shells. The boundary-scoping
 * invariants (workspace-scoped queries, ModuleGate, no global agent
 * lists) apply to each shell — these helpers let tests iterate.
 */
import fs from "fs";
import path from "path";

export const WORKSPACE_SHELLS = [
  "PersonalWorkspaceShell",
  "ProjectWorkspaceShell",
  "ResearchWorkspaceShell",
] as const;

export type WorkspaceShellName = (typeof WORKSPACE_SHELLS)[number];

const CLIENT_PAGES = path.resolve(process.cwd(), "client/src/pages");

export function shellPath(name: WorkspaceShellName): string {
  return path.join(CLIENT_PAGES, `${name}.tsx`);
}

export function shellSource(name: WorkspaceShellName): string {
  return fs.readFileSync(shellPath(name), "utf-8");
}

export function allShellSources(): Array<{
  name: WorkspaceShellName;
  source: string;
}> {
  return WORKSPACE_SHELLS.map((name) => ({ name, source: shellSource(name) }));
}
