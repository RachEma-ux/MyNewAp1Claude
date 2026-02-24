/**
 * Shell Status Bar Template — Bottom status indicator
 *
 * Copy to: client/src/components/your-shell/YourStatusBar.tsx
 * Adapt: status indicators, governance query
 */

import { cn } from "@/lib/utils";
import { Shield } from "lucide-react";

interface StatusBarProps {
  entityId: number;
  enabledModuleCount: number;
  onOversightOpen?: () => void;
}

export function ShellStatusBar({
  entityId,
  enabledModuleCount,
  onOversightOpen,
}: StatusBarProps) {
  // Optional: wire a governance/health query here
  const healthy = true;

  return (
    <div className="flex items-center justify-between border-t bg-card px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono">ID-{entityId}</span>
        <span>{enabledModuleCount} modules</span>
      </div>

      <div className="flex items-center gap-3">
        {onOversightOpen && (
          <button
            onClick={onOversightOpen}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Shield className={cn("h-3 w-3", healthy ? "text-green-500" : "text-red-500")} />
            <span>{healthy ? "OK" : "Issue"}</span>
          </button>
        )}

        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span>Connected</span>
        </div>
      </div>
    </div>
  );
}
