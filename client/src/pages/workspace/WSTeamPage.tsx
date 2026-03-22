/**
 * WSTeamPage — Human participant management within a workspace
 *
 * Shows workspace members (team), their roles, and management controls.
 * Distinct from Crew (AI participants).
 */

import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Shield, Crown, Eye, Edit } from "lucide-react";

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  owner: { label: "Owner", icon: <Crown className="h-3 w-3" />, color: "bg-amber-500/10 text-amber-600" },
  admin: { label: "Admin", icon: <Shield className="h-3 w-3" />, color: "bg-blue-500/10 text-blue-600" },
  member: { label: "Member", icon: <Edit className="h-3 w-3" />, color: "bg-green-500/10 text-green-600" },
  viewer: { label: "Viewer", icon: <Eye className="h-3 w-3" />, color: "bg-gray-500/10 text-gray-600" },
};

export function WSTeamPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);

  const { data: members, isLoading } = trpc.workspaces.members.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0 }
  );

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

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading team...</p>
      ) : !members?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No team members yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(members as any[]).map((member: any, i: number) => {
            const rc = ROLE_CONFIG[member.role] || ROLE_CONFIG.viewer;
            return (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {member.userId}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">User #{member.userId}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${rc.color}`}>
                    {rc.icon}
                    <span className="ml-1">{rc.label}</span>
                  </Badge>
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
