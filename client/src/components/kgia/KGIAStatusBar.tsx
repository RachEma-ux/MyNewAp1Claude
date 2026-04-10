import { cn } from "@/lib/utils";
import { Database, Clock, ShieldCheck, Activity } from "lucide-react";

interface KGIAStatusBarProps {
  sourceCount: number;
  lastMode?: string;
  lastDurationMs?: number;
  governanceVerdict?: string;
  sessionTitle?: string;
}

export default function KGIAStatusBar({
  sourceCount,
  lastMode,
  lastDurationMs,
  governanceVerdict,
  sessionTitle,
}: KGIAStatusBarProps) {
  return (
    <div className="flex items-center gap-0 border-t border-border bg-card/50 h-7 px-3 text-[10px] text-muted-foreground shrink-0">
      {/* Sources */}
      <div className="flex items-center gap-1 pr-3 border-r border-border">
        <Database className="w-2.5 h-2.5" />
        <span>{sourceCount} source{sourceCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Last mode */}
      {lastMode && (
        <div className="flex items-center gap-1 px-3 border-r border-border">
          <Activity className="w-2.5 h-2.5" />
          <span>{lastMode.replace(/_/g, " ")}</span>
        </div>
      )}

      {/* Duration */}
      {lastDurationMs !== undefined && (
        <div className="flex items-center gap-1 px-3 border-r border-border">
          <Clock className="w-2.5 h-2.5" />
          <span>{lastDurationMs}ms</span>
        </div>
      )}

      {/* Governance verdict */}
      {governanceVerdict && (
        <div className="flex items-center gap-1 px-3 border-r border-border">
          <ShieldCheck className="w-2.5 h-2.5" />
          <span
            className={cn(
              governanceVerdict === "allow" && "text-green-500",
              governanceVerdict === "deny" && "text-red-500",
              governanceVerdict === "conditions" && "text-yellow-500"
            )}
          >
            {governanceVerdict}
          </span>
        </div>
      )}

      {/* Session */}
      {sessionTitle && (
        <div className="flex items-center gap-1 px-3 truncate">
          <span className="truncate">{sessionTitle}</span>
        </div>
      )}
    </div>
  );
}
