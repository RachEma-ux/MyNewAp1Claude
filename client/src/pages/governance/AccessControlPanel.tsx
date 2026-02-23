import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Lock, Key } from "lucide-react";

export default function AccessControlPanel() {
  const { data, isLoading, error } = trpc.governance.myPermissions.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading access control...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load permissions: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const role = data?.role ?? "unknown";
  const permissions = data?.permissions ?? [];
  const allRoles = data?.allRoles ?? [];

  // Group permissions by category (before the dot)
  const grouped: Record<string, string[]> = {};
  for (const perm of permissions) {
    const parts = perm.split(".");
    const category = parts.length > 1 ? parts[0] : "general";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(perm);
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Access Control (RBAC)</h1>
        <p className="text-muted-foreground mt-2">
          Current role permissions and governance access
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Current Role
            </CardDescription>
            <CardTitle className="text-2xl capitalize">{role}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="text-sm">{role}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Available Roles</CardDescription>
            <CardTitle className="text-2xl">{allRoles.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allRoles.map((r: string) => (
                <Badge key={r} variant={r === role ? "default" : "outline"}>{r}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Permissions ({permissions.length})
          </CardTitle>
          <CardDescription>Grouped by category</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(grouped).length === 0 ? (
            <p className="text-muted-foreground text-sm">No permissions assigned</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([category, perms]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">{category}</h3>
                  <div className="flex flex-wrap gap-2">
                    {perms.map((p) => (
                      <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
