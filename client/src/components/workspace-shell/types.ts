/**
 * Workspace Execution Shell — Shared Types
 *
 * Data contract between the backend shell-view-resolver
 * and the frontend shell components.
 */

export interface ShellViewData {
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

/** Participant classification for rendering logic */
export type ParticipantType = "manager" | "member" | "viewer" | "agent";

export function classifyParticipant(role: string | null, isManager: boolean): ParticipantType {
  if (isManager) return "manager";
  if (role === "editor" || role === "member") return "member";
  return "viewer";
}
