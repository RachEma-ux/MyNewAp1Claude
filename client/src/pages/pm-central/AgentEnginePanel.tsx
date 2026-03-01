/**
 * AgentEnginePanel — Agent Engine dashboard for PM Central
 *
 * 4 sections:
 *   1. Catalog Bindings — cards for each agent alias
 *   2. Agent Packs — grouped workflow packs
 *   3. Recent Runs — table of runs across projects
 *   4. Launch Run — dialog to create a new agent run
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Bot, Package, Play, Shield, Clock, ChevronRight, AlertTriangle,
  FileText, Users, Search, Target, DollarSign, CheckSquare,
} from "lucide-react";

const AGENT_ICONS: Record<string, React.ReactNode> = {
  charter_drafter: <FileText className="h-4 w-4" />,
  scope_analyst: <Search className="h-4 w-4" />,
  stakeholder_mapper: <Users className="h-4 w-4" />,
  risk_screener: <AlertTriangle className="h-4 w-4" />,
  readiness_checker: <CheckSquare className="h-4 w-4" />,
  schedule_builder: <Clock className="h-4 w-4" />,
  cost_estimator: <DollarSign className="h-4 w-4" />,
  quality_checker: <Target className="h-4 w-4" />,
  risk_analyst: <AlertTriangle className="h-4 w-4" />,
};

export default function AgentEnginePanel() {
  const [, navigate] = useLocation();
  const [launchOpen, setLaunchOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedPack, setSelectedPack] = useState<string>("");
  const [selectedRunType, setSelectedRunType] = useState<string>("");

  const bindingsQuery = trpc.modules.pmt.shell.agentEngine.bindings.list.useQuery();
  const packsQuery = trpc.modules.pmt.shell.agentEngine.packs.list.useQuery();
  const runsQuery = trpc.modules.pmt.shell.agentEngine.runs.list.useQuery({});
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const createRun = trpc.modules.pmt.shell.agentEngine.runs.create.useMutation();

  const bindings = bindingsQuery.data || [];
  const packs = packsQuery.data || [];
  const runs = runsQuery.data || [];
  const projects = projectsQuery.data || [];

  const RUN_TYPES = [
    { value: "initiating_run", label: "Initiating Run" },
    { value: "planning_run", label: "Planning Run" },
    { value: "gate_readiness_check", label: "Gate Readiness Check" },
    { value: "risk_deep_dive", label: "Risk Deep Dive" },
  ];

  async function handleLaunchRun() {
    if (!selectedProject || !selectedPack || !selectedRunType) return;
    try {
      const run = await createRun.mutateAsync({
        projectId: parseInt(selectedProject),
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
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6" />
              Agent Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Catalog-bound multi-agent orchestration for AI-assisted PM workflows
            </p>
          </div>
          <Button onClick={() => setLaunchOpen(true)} className="gap-2">
            <Play className="h-4 w-4" />
            Launch Run
          </Button>
        </div>

        {/* Orchestrator Invariants Banner */}
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-yellow-500 shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Safety Invariants Active:</span>{" "}
              Agents cannot approve gates, transition states, lock baselines, or freeze projects.
              All drafts require human commit.
            </div>
          </CardContent>
        </Card>

        {/* Section 1: Catalog Bindings */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Catalog Bindings
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ({bindings.length} agents)
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bindings.map((b: any) => (
              <Card key={b.alias} className="hover:border-primary/30 transition-colors">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded bg-muted shrink-0 mt-0.5">
                      {AGENT_ICONS[b.alias] || <Bot className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{b.display_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {b.catalog_id}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{b.description}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {b.phases_allowed.map((p: string) => (
                          <span
                            key={p}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-medium"
                          >
                            {p}
                          </span>
                        ))}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">
                          {b.enforcement_overlay.deny.length} denied
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 2: Agent Packs */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Agent Packs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {packs.map((pack: any) => (
              <Card key={pack.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-sm">{pack.name}</div>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {pack.agents.length} agents
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">{pack.description}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {pack.agents.map((alias: string) => (
                      <span
                        key={alias}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
                      >
                        {alias.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <span>Trigger: {pack.trigger}</span>
                    {pack.policies.require_human_commit && (
                      <span className="flex items-center gap-0.5">
                        <Shield className="h-3 w-3" /> Human commit required
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 3: Recent Runs */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Runs
          </h2>
          {runs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No runs yet. Launch your first agent run to get started.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 px-3 font-medium">ID</th>
                      <th className="py-2 px-3 font-medium">Type</th>
                      <th className="py-2 px-3 font-medium">Pack</th>
                      <th className="py-2 px-3 font-medium">Project</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Created</th>
                      <th className="py-2 px-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run: any) => (
                      <tr
                        key={run.id}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/pm-central/agent-engine/run/${run.id}`)}
                      >
                        <td className="py-2 px-3 font-mono text-xs">#{run.id}</td>
                        <td className="py-2 px-3 text-xs">{run.runType.replace(/_/g, " ")}</td>
                        <td className="py-2 px-3 text-xs">{run.packId.replace(/_/g, " ")}</td>
                        <td className="py-2 px-3 text-xs">
                          {projects.find((p: any) => p.id === run.projectId)?.name || `#${run.projectId}`}
                        </td>
                        <td className="py-2 px-3">
                          <AgentBadge variant={run.status} />
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Launch Run Dialog */}
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
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Project</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                disabled={!selectedProject || !selectedPack || !selectedRunType || createRun.isPending}
              >
                {createRun.isPending ? "Launching..." : "Launch Run"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
