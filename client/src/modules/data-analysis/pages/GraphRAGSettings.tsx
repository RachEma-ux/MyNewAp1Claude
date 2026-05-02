import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Settings, Server, Shield, Gauge } from "lucide-react";

export function GraphRAGSettings() {
  const { data: workerStatus, isLoading } =
    trpc.dataAnalysis.graphRag.workerStatus.useQuery();

  return (
    <div className="space-y-4 mt-4">
      {/* Worker Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4" />
            Worker Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm">Worker Status</span>
                <Badge variant={workerStatus?.healthy ? "default" : "secondary"}>
                  {workerStatus?.healthy ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Worker URL</span>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {workerStatus?.url}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                The GraphRAG worker is a Python service that handles indexing and querying.
                Set <code>GRAPHRAG_WORKER_URL</code> environment variable to configure.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cost Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Cost &amp; Runtime Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Documents Per Sync</span>
              <span className="font-mono">10,000</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Tokens Per Index</span>
              <span className="font-mono">500,000</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Index Timeout</span>
              <span className="font-mono">10 min</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Query Timeout</span>
              <span className="font-mono">1 min</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Concurrent Jobs</span>
              <span className="font-mono">2</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            These controls prevent runaway indexing costs. Adjust in server configuration.
          </p>
        </CardContent>
      </Card>

      {/* Isolation Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Module Isolation Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            GraphRAG enforces strict module isolation. Every dataset, index, and query
            is scoped to a single module slug.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>One adapter = one module</li>
            <li>One index namespace = one module dataset</li>
            <li>Cross-module queries are rejected at the API layer</li>
            <li>No raw SQL from callers — adapters export normalized documents only</li>
            <li>"Global" search means global within the selected module dataset only</li>
          </ul>
        </CardContent>
      </Card>

      {/* Default Worker Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Default Indexing Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">LLM Model</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">gpt-4o-mini</code>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Embedding Model</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                text-embedding-3-small
              </code>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Chunk Size</span>
              <span className="font-mono">1,200</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Chunk Overlap</span>
              <span className="font-mono">200</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Gleanings</span>
              <span className="font-mono">1</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Community Level</span>
              <span className="font-mono">2</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
