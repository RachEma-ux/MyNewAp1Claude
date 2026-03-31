/**
 * ExecutionMonitor — Live execution log viewer panel.
 *
 * Shows real-time execution logs with step highlighting,
 * log level filtering, and auto-scroll.
 */

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  X,
} from "lucide-react";

interface ExecutionMonitorProps {
  workflowId: number | null;
  executionId: number | null;
  onClose: () => void;
  onSelectExecution: (id: number) => void;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO: "text-green-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  WAIT: "text-blue-400",
  DEBUG: "text-zinc-400",
};

const STATUS_ICONS: Record<string, any> = {
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

export function ExecutionMonitor({ workflowId, executionId, onClose, onSelectExecution }: ExecutionMonitorProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Fetch executions for this workflow
  const executionsQuery = trpc.sandboxWf.executions.list.useQuery(
    { workflowId: workflowId || undefined },
    { enabled: !!workflowId, refetchInterval: 2000 },
  );

  // Fetch logs for selected execution
  const logsQuery = trpc.sandboxWf.executions.getLogs.useQuery(
    { executionId: executionId! },
    { enabled: !!executionId, refetchInterval: 1000 },
  );

  const executions = executionsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const filteredLogs = filterLevel ? logs.filter((l) => l.logLevel === filterLevel) : logs;

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  // Export logs as JSON
  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution-${executionId}-logs.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentExec = executions.find((e) => e.id === executionId);

  return (
    <div className="border-t bg-zinc-950 flex flex-col" style={{ height: "280px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Execution Monitor</span>
          {currentExec && (
            <>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0",
                  currentExec.status === "completed" && "text-green-400 border-green-500/30",
                  currentExec.status === "running" && "text-blue-400 border-blue-500/30",
                  currentExec.status === "failed" && "text-red-400 border-red-500/30",
                )}
              >
                {currentExec.status}
              </Badge>
              {currentExec.duration && (
                <span className="text-[10px] text-zinc-500">{currentExec.duration}ms</span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Execution selector */}
          {executions.slice(0, 5).map((exec) => (
            <Button
              key={exec.id}
              variant={executionId === exec.id ? "default" : "ghost"}
              size="sm"
              className="h-5 text-[9px] px-1.5"
              onClick={() => onSelectExecution(exec.id)}
            >
              #{exec.id}
            </Button>
          ))}

          {/* Log level filter */}
          {["INFO", "WARN", "ERROR"].map((level) => (
            <Button
              key={level}
              variant={filterLevel === level ? "default" : "ghost"}
              size="sm"
              className={cn("h-5 text-[9px] px-1.5", LOG_LEVEL_COLORS[level])}
              onClick={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              {level}
            </Button>
          ))}

          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-zinc-400" onClick={() => setAutoScroll(!autoScroll)} title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}>
            {autoScroll ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-zinc-400" onClick={exportLogs} title="Export logs">
            <Download className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-zinc-400" onClick={() => logsQuery.refetch()} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-zinc-400" onClick={onClose} title="Close">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Log output */}
      <div ref={logRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {filteredLogs.length === 0 ? (
          <div className="text-zinc-500 flex items-center gap-2">
            {executionId ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Waiting for logs...</>
            ) : (
              "Run a workflow to see execution logs here."
            )}
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="flex gap-2 hover:bg-zinc-800/50 px-1 rounded">
              <span className="text-zinc-500 shrink-0 w-16">
                {new Date(log.startedAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={cn("shrink-0 w-10", LOG_LEVEL_COLORS[log.logLevel || "INFO"])}>
                {log.logLevel}
              </span>
              {log.stepKey && (
                <span className="text-blue-300 shrink-0">[{log.stepKey}]</span>
              )}
              <span className="text-zinc-300 break-all">{log.message}</span>
              {log.duration && (
                <span className="text-zinc-600 shrink-0 ml-auto">{log.duration}ms</span>
              )}
            </div>
          ))
        )}
        <div className="flex gap-2 mt-1">
          <span className="text-zinc-500">{new Date().toLocaleTimeString("en-US", { hour12: false })}</span>
          <span className="text-green-400 animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
}
