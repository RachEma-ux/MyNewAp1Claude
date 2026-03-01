/**
 * ProjectAgentRunsPanel — Agent runs scoped to a specific project
 *
 * Shows recent runs, drafts summary, and launch button for the project.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import AgentBadge from "@/components/pm/AgentBadge";
import { Bot, Play, ChevronRight, Clock } from "lucide-react";

const RUN_TYPES = [
  { value: "initiating_run", label: "Initiating Run" },
  { value: "planning_run", label: "Planning Run" },
  { value: "gate_readiness_check", label: "Gate Readiness Check" },
  { value: "risk_deep_dive", label: "Risk Deep Dive" },
];

export default function ProjectAgentRunsPanel({ projectId }: { projectId: number }) {
  const [, navigate] = useLocation();
  const [launchOpen, setLaunchOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState("");
  const [selectedRunType, setSelectedRunType] = useState("");

  const runsQuery = trpc.modules.pmt.shell.agentEngine.runs.list.useQuery(
    { projectId },
    { refetchInterval: 5000 },
  );
  const packsQuery = trpc.modules.pmt.shell.agentEngine.packs.list.useQuery();
  const createRun = trpc.modules.pmt.shell.agentEngine.runs.create.useMutation();

  const runs = runsQuery.data || [];
  const packs = packsQuery.data || [];

  async function handleLaunchRun() {
    if (!selectedPack || !selectedRunType) return;
    try {
      const run = await createRun.mutateAsync({
        projectId,
        runType: selectedRunType,
        packId: selectedPack,
      });
      setLaunchOpen(false);
      runsQuery.refetch();
      navigate(`/pm-central/agent-engine/run/${run.id}`);
    } catch (err: any) {
      console.error("Failed to launch run:", err.message);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Agent Runs
        </h2>
        <Button size="sm" onClick={() => setLaunchOpen(true)} className="gap-1.5">
          <Play className="h-3.5 w-3.5" />
          Launch Run
        </Button>
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No agent runs for this project yet. Launch a run to generate AI-assisted drafts.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {runs.map((run: any) => (
            <Card
              key={run.id}
              className="hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/pm-central/agent-engine/run/${run.id}`)}
            >
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      #{run.id} — {run.runType.replace(/_/g, " ")}
                    </span>
                    <AgentBadge variant={run.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>Pack: {run.packId.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Launch Dialog */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Launch Agent Run
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pack</label>
              <Select value={selectedPack} onValueChange={setSelectedPack}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent pack..." />
                </SelectTrigger>
                <SelectContent>
                  {packs.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.agents.length} agents)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Run Type</label>
              <Select value={selectedRunType} onValueChange={setSelectedRunType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select run type..." />
                </SelectTrigger>
                <SelectContent>
                  {RUN_TYPES.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>
                      {rt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLaunchRun}
              disabled={!selectedPack || !selectedRunType || createRun.isPending}
            >
              {createRun.isPending ? "Launching..." : "Launch Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
