import { cn } from "@/lib/utils";
import { Zap, HeartPulse, Database, Clock } from "lucide-react";

interface Props {
  connected: boolean;
  healthStatus: string;
  modelCount: number;
  lastSync: string | null;
}

export default function OpenRouterStatusBar({ connected, healthStatus, modelCount, lastSync }: Props) {
  return (
    <div className="flex items-center gap-0 border-t border-border bg-card/50 h-7 px-3 text-[10px] text-muted-foreground shrink-0">
      <div className="flex items-center gap-1 pr-3 border-r border-border">
        <Zap className="w-2.5 h-2.5" />
        <span className={cn(connected ? "text-green-500" : "text-red-500")}>{connected ? "Connected" : "Disconnected"}</span>
      </div>
      <div className="flex items-center gap-1 px-3 border-r border-border">
        <HeartPulse className="w-2.5 h-2.5" />
        <span className={cn(
          healthStatus === "healthy" && "text-green-500",
          healthStatus === "degraded" && "text-yellow-500",
          healthStatus === "down" && "text-red-500",
        )}>{healthStatus}</span>
      </div>
      <div className="flex items-center gap-1 px-3 border-r border-border">
        <Database className="w-2.5 h-2.5" />
        <span>{modelCount} models</span>
      </div>
      {lastSync && (
        <div className="flex items-center gap-1 px-3">
          <Clock className="w-2.5 h-2.5" />
          <span>Synced {new Date(lastSync).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
