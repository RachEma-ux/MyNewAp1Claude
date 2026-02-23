import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Users, Shield } from "lucide-react";

export default function RolesMembershipPanel() {
  const { data, isLoading, error } = trpc.hq.rolesMembership.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load roles: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Roles & Membership</h1>
        <p className="text-muted-foreground mt-1">
          User roles, workspace members, and RBAC assignments
        </p>
      </div>

      {data?.currentUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Current User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{data.currentUser.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{data.currentUser.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <Badge>{data.currentUser.role}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ID</p>
                <p className="font-mono text-sm">{data.currentUser.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Members ({data?.members?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.members && data.members.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium">Email</th>
                    <th className="text-left py-2 px-3 font-medium">Role</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m: any) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 px-3">{m.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{m.email || "—"}</td>
                      <td className="py-2 px-3"><Badge variant="outline">{m.role}</Badge></td>
                      <td className="py-2 px-3">
                        <Badge variant={m.status === "active" ? "default" : "secondary"}>
                          {m.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No members found</p>
          )}
        </CardContent>
      </Card>

      {data?.rbacRoles && data.rbacRoles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>RBAC Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.rbacRoles.map((role: string) => (
                <Badge key={role} variant="outline">{role}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
