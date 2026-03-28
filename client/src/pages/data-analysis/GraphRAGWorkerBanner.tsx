/**
 * GraphRAG Worker Offline Banner
 *
 * Shared inline banner shown on tabs that require the Python worker.
 * Keeps messaging consistent and actionable.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ServerOff } from "lucide-react";

interface Props {
  /** Short context for where the banner appears */
  context?: string;
}

export function WorkerOfflineBanner({ context }: Props) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 mt-4">
      <CardContent className="flex items-start gap-3 py-4">
        <ServerOff className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">Python Worker Offline</span>
            <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[10px]">
              Requires Worker
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {context
              ? `${context} requires the GraphRAG Python worker service.`
              : "This feature requires the GraphRAG Python worker service."}
            {" "}The worker handles indexing and querying via Microsoft's graphrag library.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Dataset registration, source adapters, and sync operations work without the worker.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
