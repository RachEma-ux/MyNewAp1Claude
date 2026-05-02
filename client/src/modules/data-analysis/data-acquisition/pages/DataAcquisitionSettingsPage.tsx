/**
 * DataAcquisitionSettingsPage — connector status + worker URL.
 *
 * Renders the worker reachability banner and a static list of supported
 * connector classes (real / configured / unconfigured) so operators can
 * see at a glance which integrations require env vars.
 */

import { trpc } from "@/lib/trpc";
import { WorkerStatusBanner } from "../components/WorkerStatusBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONNECTORS: Array<{
  name: string;
  kind: "real" | "configured" | "unconfigured";
  envVars: string[];
}> = [
  { name: "local", kind: "real", envVars: [] },
  { name: "manual", kind: "real", envVars: [] },
  { name: "webhook", kind: "real", envVars: [] },
  { name: "s3", kind: "configured", envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"] },
  { name: "gdrive", kind: "configured", envVars: ["GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN"] },
  { name: "github", kind: "configured", envVars: ["GITHUB_TOKEN"] },
  { name: "api", kind: "configured", envVars: [] },
  { name: "database", kind: "configured", envVars: [] },
  { name: "sensor", kind: "configured", envVars: ["SENSOR_BROKER_URL"] },
  { name: "stream", kind: "configured", envVars: ["STREAM_BROKER_URL"] },
  { name: "saas", kind: "configured", envVars: [] },
  { name: "web", kind: "configured", envVars: [] },
  { name: "object-storage", kind: "configured", envVars: [] },
];

const KIND_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  real: "default",
  configured: "secondary",
  unconfigured: "outline",
};

export default function DataAcquisitionSettingsPage() {
  const sources = trpc.dataAnalysis.dataAcquisition.listSources.useQuery({});
  const sourceCount = sources.data?.length ?? 0;
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Settings
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Worker reachability and supported connector classes. Connectors
          gated by env vars return <code>unconfigured</code> until the env
          is provided — they never throw.
        </p>
      </div>
      <WorkerStatusBanner />
      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {sourceCount} source(s) registered.
          </p>
          {CONNECTORS.map((c) => (
            <div
              key={c.name}
              className="border rounded p-3 text-sm flex items-center justify-between"
            >
              <div>
                <span className="font-medium">{c.name}</span>
                {c.envVars.length > 0 ? (
                  <span className="text-xs text-muted-foreground ml-2">
                    env: {c.envVars.join(", ")}
                  </span>
                ) : null}
              </div>
              <Badge variant={KIND_BADGE[c.kind]}>{c.kind}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
