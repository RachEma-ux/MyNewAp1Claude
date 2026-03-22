/**
 * Shell View Resolver — Returns participant-aware shell configuration
 *
 * The manager configures what participants see via workspace.shellConfig.
 * This resolver produces a view object the frontend uses to render:
 *   - visible sidebar sections
 *   - visible toolbar items
 *   - priority/emphasis
 *   - quick actions
 *   - alerts allowed
 *   - participant-specific mission emphasis
 *   - manager-only controls where applicable
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  workspaces,
  workspaceMembers,
  workspaceCrew,
  type WorkspaceShellConfig,
} from "../../drizzle/schema";
import { getUserWorkspaceRole } from "../workspaces/permissions-service";
import { resolveWorkspaceCapabilities } from "./capability-resolver";
import { getWorkspaceModules } from "../modules/registry";

export interface ShellView {
  workspaceId: number;
  workspaceName: string;
  workspaceDescription: string | null;
  workspaceType: string | null;
  purposeType: string | null;
  purposeRef: string | null;
  status: string;
  participantRole: string | null;
  isManager: boolean;
  isAdmin: boolean;

  sidebar: {
    showIdentity: boolean;
    showPurpose: boolean;
    showMission: boolean;
    showCurrentWork: boolean;
    showActivityLog: boolean;
    showAlerts: boolean;
    showQuickActions: boolean;
    showGuide: boolean;
    showHealth: boolean;
  };

  toolbar: {
    visibleItems: string[];
    priorityItems: string[];
  };

  quickActions: string[];
  alertsEnabled: boolean;
  missionEmphasis: string | null;

  managerControls: {
    showConfiguration: boolean;
    showVisibilityLayer: boolean;
  };

  enabledModules: string[];
  capabilities: string[];

  teamCount: number;
  crewCount: number;
}

const DEFAULT_SIDEBAR = {
  showIdentity: true,
  showPurpose: true,
  showMission: true,
  showCurrentWork: true,
  showActivityLog: true,
  showAlerts: true,
  showQuickActions: true,
  showGuide: true,
  showHealth: true,
};

const DEFAULT_TOOLBAR_ITEMS = [
  "resources",
  "team",
  "crew",
  "documents",
  "collaboration",
  "workflow-designer",
  "pm-toolbox",
  "knowledge",
  "rules",
];

/**
 * Resolve a complete shell view for a participant in a workspace.
 * Combines workspace config, role, capabilities, and module state.
 */
export async function getWorkspaceShellView(
  workspaceId: number,
  participantId: number
): Promise<ShellView | null> {
  const dbConn = getDb();
  if (!dbConn) return null;

  // 1. Load workspace
  const [ws] = await dbConn
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!ws) return null;

  // 2. Resolve role
  const role = await getUserWorkspaceRole(workspaceId, participantId);
  const isManager = role === "owner" || role === "admin";
  const isAdmin = role === "admin";

  // 3. Resolve capabilities
  let capabilities: string[] = [];
  try {
    const caps = await resolveWorkspaceCapabilities(participantId, workspaceId);
    capabilities = [...caps];
  } catch {
    capabilities = [];
  }

  // 4. Load modules
  let enabledModules: string[] = [];
  try {
    const mods = await getWorkspaceModules(workspaceId);
    enabledModules = mods.filter((m: any) => m.enabled).map((m: any) => m.moduleKey);
  } catch {
    enabledModules = [];
  }

  // 5. Load shell config (manager-defined)
  const shellConfig = (ws as any).shellConfig as WorkspaceShellConfig | null;

  // 6. Count team and crew
  const teamMembers = await dbConn
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const crewMembers = await dbConn
    .select()
    .from(workspaceCrew)
    .where(eq(workspaceCrew.workspaceId, workspaceId));

  // 7. Resolve participant-specific visibility
  const participantRoleKey = role || "viewer";
  const participantVisibility = shellConfig?.participantVisibility?.[participantRoleKey];

  // 8. Compute sidebar
  const sidebar = shellConfig?.sidebar || DEFAULT_SIDEBAR;

  // If participant-specific visibility is configured, filter
  const effectiveSidebar = participantVisibility
    ? {
        showIdentity: participantVisibility.sidebarSections.includes("identity"),
        showPurpose: participantVisibility.sidebarSections.includes("purpose"),
        showMission: participantVisibility.sidebarSections.includes("mission"),
        showCurrentWork: participantVisibility.sidebarSections.includes("currentWork"),
        showActivityLog: participantVisibility.sidebarSections.includes("activityLog"),
        showAlerts: participantVisibility.canSeeAlerts,
        showQuickActions: participantVisibility.sidebarSections.includes("quickActions"),
        showGuide: participantVisibility.sidebarSections.includes("guide"),
        showHealth: participantVisibility.sidebarSections.includes("health"),
      }
    : sidebar;

  // 9. Compute toolbar
  const visibleToolbar = participantVisibility?.toolbarItems
    || shellConfig?.toolbar?.visibleItems
    || DEFAULT_TOOLBAR_ITEMS;

  const priorityToolbar = shellConfig?.toolbar?.priorityItems || [];

  return {
    workspaceId,
    workspaceName: ws.name,
    workspaceDescription: ws.description,
    workspaceType: ws.type,
    purposeType: (ws as any).purposeType,
    purposeRef: (ws as any).purposeRef,
    status: ws.status,
    participantRole: role,
    isManager,
    isAdmin,

    sidebar: effectiveSidebar,

    toolbar: {
      visibleItems: visibleToolbar,
      priorityItems: priorityToolbar,
    },

    quickActions: shellConfig?.quickActions || [],
    alertsEnabled: shellConfig?.alertsEnabled ?? true,
    missionEmphasis: shellConfig?.missionEmphasis ?? null,

    managerControls: {
      showConfiguration: isManager,
      showVisibilityLayer: isManager,
    },

    enabledModules,
    capabilities,

    teamCount: teamMembers.length,
    crewCount: crewMembers.length,
  };
}
