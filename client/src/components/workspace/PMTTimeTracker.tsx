/**
 * PMT Time Tracker — Floating timer widget for logging time
 */

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Square, Save, Timer } from "lucide-react";
import { toast } from "sonner";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PMTTimeTracker({ workspaceId }: { workspaceId: number }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [comment, setComment] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const utils = trpc.useUtils();

  const createMut = trpc.modules.pmt.timeEntries.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.timeEntries.list.invalidate();
      setShowLog(false);
      setElapsed(0);
      setComment("");
      toast.success("Time logged");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const handleStart = () => {
    setRunning(true);
    setShowLog(false);
  };

  const handleStop = () => {
    setRunning(false);
    setShowLog(true);
  };

  const handleLog = () => {
    if (!projectId) { toast.error("Select a project"); return; }
    const hours = Math.round((elapsed / 3600) * 100) / 100;
    if (hours <= 0) { toast.error("No time to log"); return; }
    createMut.mutate({
      workspaceId,
      projectId: parseInt(projectId),
      userId: 1,
      hours,
      comment: comment || undefined,
      spentOn: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-card border rounded-lg shadow-lg p-3 space-y-2 min-w-[240px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Tracker</span>
          </div>
          <span className={`font-mono text-lg ${running ? "text-green-500" : ""}`}>
            {formatElapsed(elapsed)}
          </span>
        </div>

        <div className="flex gap-2">
          {!running ? (
            <Button size="sm" className="flex-1" onClick={handleStart}>
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          ) : (
            <Button size="sm" variant="destructive" className="flex-1" onClick={handleStop}>
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          )}
        </div>

        {showLog && elapsed > 0 && (
          <div className="space-y-2 border-t pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Comment</Label>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you work on?"
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" className="w-full" onClick={handleLog} disabled={createMut.isPending}>
              <Save className="h-3 w-3 mr-1" />
              Log {(elapsed / 3600).toFixed(1)}h
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
