import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Building2, Shield, Snowflake, Settings } from "lucide-react";

export default function OrgAuthorityPanel() {
  const { data, isLoading, error } = trpc.hq.orgAuthority.useQuery();

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
        Failed to load organization authority: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Authority</h1>
        <p className="text-muted-foreground mt-1">
          Workspace ownership, system configuration, and governance freeze status
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Owner</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.owner?.name || "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Role: {data?.owner?.role || "unknown"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={data?.systemStatus === "operational" ? "default" : "destructive"}>
              {data?.systemStatus || "unknown"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freeze Status</CardTitle>
            <Snowflake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.frozenCount ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.freezeActive ? "System freeze ACTIVE" : "No freeze active"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configuration</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.configItems?.providers ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Providers configured
            </p>
          </CardContent>
        </Card>
      </div>

      {data?.configItems && (
        <Card>
          <CardHeader>
            <CardTitle>System Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Environment</p>
                <p className="text-sm font-bold mt-1">{data.configItems.nodeEnv}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">OPA Policy</p>
                <Badge variant={data.configItems.opaConfigured ? "default" : "secondary"} className="mt-1">
                  {data.configItems.opaConfigured ? "Configured" : "Not Set"}
                </Badge>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Drift Detection</p>
                <Badge variant={data.configItems.driftActive ? "default" : "secondary"} className="mt-1">
                  {data.configItems.driftActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Providers</p>
                <p className="text-sm font-bold mt-1">{data.configItems.providers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
