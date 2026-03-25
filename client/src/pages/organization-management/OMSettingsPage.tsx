/**
 * OM Settings — Module feature flags and configuration
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

export function OMSettingsPage({ workspaceId }: { workspaceId: number }) {
  const settings = trpc.organizationManagement.settings.get.useQuery({ workspaceId });

  const features = settings.data?.features ?? {};
  const featureEntries = Object.entries(features) as [string, boolean][];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">OM Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            Module Info
            <Badge variant="outline">{settings.data?.version ?? "..."}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Module: <span className="font-medium text-foreground">{settings.data?.module?.toUpperCase() ?? "OM"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Feature Flags</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {featureEntries.map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between py-1 text-sm">
              <span className="capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              {enabled ? (
                <Badge variant="default" className="text-xs gap-1"><CheckCircle className="w-3 h-3" /> Enabled</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs gap-1"><XCircle className="w-3 h-3" /> Disabled</Badge>
              )}
            </div>
          ))}
          {featureEntries.length === 0 && <p className="text-sm text-muted-foreground">Loading settings...</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default OMSettingsPage;
