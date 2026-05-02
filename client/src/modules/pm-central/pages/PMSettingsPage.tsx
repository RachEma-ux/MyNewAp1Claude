/**
 * /pm-central/rtlm/settings — PM Central RTLM module settings + health.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PMSettingsPage() {
  const { data, isLoading } = trpc.pmCentral.dashboard.health.useQuery();
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Module health</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : data ? (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    data.state === "ok"
                      ? "default"
                      : data.state === "degraded"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {data.state}
                </Badge>
                <span>{data.message}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                checked at {data.checkedAt}
              </p>
            </div>
          ) : (
            <p className="text-sm text-destructive">No health response.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Identity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm flex flex-col gap-1">
          <div>module key: <span className="font-mono">pmCentral</span></div>
          <div>router key: <span className="font-mono">pmCentral</span></div>
          <div>database: <span className="font-mono">pmdb</span></div>
          <div>base route: <span className="font-mono">/pm-central</span></div>
          <div>RTLM frontend: <span className="font-mono">/pm-central/rtlm/*</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
