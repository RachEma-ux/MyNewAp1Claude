/**
 * WSTeamPage — Human participant management within a workspace
 *
 * Shows workspace members (team), their roles, and management controls.
 * Uses the reusable DirectoryDropdown from the HR module to select employees.
 * Distinct from Crew (AI participants).
 */

import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Shield, Crown, Eye, Edit, Trash2, Loader2 } from "lucide-react";
import { DirectoryDropdown, type DirectoryEntry } from "@/components/DirectoryDropdown";

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  owner: { label: "Owner", icon: <Crown className="h-3 w-3" />, color: "bg-amber-500/10 text-amber-600" },
  admin: { label: "Admin", icon: <Shield className="h-3 w-3" />, color: "bg-blue-500/10 text-blue-600" },
  editor: { label: "Editor", icon: <Edit className="h-3 w-3" />, color: "bg-green-500/10 text-green-600" },
  member: { label: "Member", icon: <Edit className="h-3 w-3" />, color: "bg-green-500/10 text-green-600" },
  viewer: { label: "Viewer", icon: <Eye className="h-3 w-3" />, color: "bg-gray-500/10 text-gray-600" },
};

export function WSTeamPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);

  const [addRole, setAddRole] = useState<"editor" | "viewer">("editor");

  const utils = trpc.useUtils();

  const { data: members, isLoading } = trpc.workspaces.members.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0 },
  );

  const addMember = trpc.workspaces.members.add.useMutation({
    onSuccess: () => utils.workspaces.members.list.invalidate({ workspaceId }),
  });

  const removeMember = trpc.workspaces.members.remove.useMutation({
    onSuccess: () => utils.workspaces.members.list.invalidate({ workspaceId }),
  });

  const updateRole = trpc.workspaces.members.updateRole.useMutation({
    onSuccess: () => utils.workspaces.members.list.invalidate({ workspaceId }),
  });

  function handleAddEmployee(entry: DirectoryEntry) {
    addMember.mutate({
      workspaceId,
      userId: entry.workerId,
      role: addRole,
    });
  }

  function handleRemove(userId: number) {
    removeMember.mutate({ workspaceId, userId });
  }

  function handleRoleChange(userId: number, role: "editor" | "viewer") {
    updateRole.mutate({ workspaceId, userId, role });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" /> Team
          </h2>
          <p className="text-sm text-muted-foreground">Human participants in this workspace</p>
        </div>
      </div>

      {/* ---- Add Team Member ---- */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" /> Add Team Member
          </h3>
          <p className="text-xs text-muted-foreground">
            Select an employee from the HR Directory to add to this workspace.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <DirectoryDropdown
                statusFilter="active"
                placeholder="Search HR Directory..."
                onSelect={handleAddEmployee}
                disabled={addMember.isPending}
                className="w-full"
              />
            </div>
            <Select value={addRole} onValueChange={(v) => setAddRole(v as "editor" | "viewer")}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {addMember.isError && (
            <p className="text-xs text-destructive">
              {addMember.error?.message || "Failed to add member"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---- Members List ---- */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !members?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No team members yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the HR Directory picker above to add employees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {(members as any[]).map((member: any, i: number) => {
            const rc = ROLE_CONFIG[member.role] || ROLE_CONFIG.viewer;
            const initials = member.displayName
              ? member.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
              : String(member.userId);
            return (
              <Card key={member.userId ?? i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.displayName || `User #${member.userId}`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.email || `Joined ${new Date(member.joinedAt).toLocaleDateString()}`}
                    </p>
                  </div>

                  {/* Role selector */}
                  {member.role === "owner" ? (
                    <Badge variant="outline" className={`text-xs ${rc.color}`}>
                      {rc.icon}
                      <span className="ml-1">{rc.label}</span>
                    </Badge>
                  ) : (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.userId, v as "editor" | "viewer")}
                      disabled={updateRole.isPending}
                    >
                      <SelectTrigger className="h-7 w-[100px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Remove button (not for owners) */}
                  {member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(member.userId)}
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WSTeamPage;
