import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Plus, Shield, Trash2, Download, CheckSquare, Square, TrendingUp, Edit2, Upload } from "lucide-react";
import AgentWizard from "@/components/AgentWizard";
import { AgentStatusBadge } from "@/components/agents/AgentStatusBadge";
import { AppBlockerAlert } from "@/components/errors/AppBlockerAlert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc";
import { getAppBlocker, showBlockerToast } from "@/lib/appBlockers";
import type { AppBlockerPayload } from "@shared/blockers";
import {
  AGENT_STATUS_LABELS,
  getDefaultPromotionTarget,
  type AgentStatus,
} from "@shared/agent-lifecycle";

function getComplianceScore(agent: any): number {
  let score = 100;
  if (agent.temperature && parseFloat(agent.temperature) > 1.5) score -= 20;
  if (agent.systemPrompt?.length > 2000) score -= 15;
  if (agent.hasDocumentAccess && agent.hasToolAccess) score -= 10;
  if (agent.status === "draft") score -= 5;
  return Math.max(0, score);
}

function getComplianceBadge(agent: any) {
  const score = getComplianceScore(agent);
  if (score >= 90) {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
        <TrendingUp className="w-3 h-3" />
        {score}%
      </Badge>
    );
  }
  if (score >= 70) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
        <TrendingUp className="w-3 h-3" />
        {score}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
      <TrendingUp className="w-3 h-3" />
      {score}%
    </Badge>
  );
}

export default function AgentsPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [wizardOpen, setWizardOpen] = useState(location === "/agents/create" || location === "/agents/wizard");
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promotionResult, setPromotionResult] = useState<any>(null);
  const [promotionBlocker, setPromotionBlocker] = useState<AppBlockerPayload | null>(null);
  const [promotionReason, setPromotionReason] = useState("");
  const [promotionDiff, setPromotionDiff] = useState("");

  const utils = trpc.useUtils();
  const { data: agents = [], isLoading, refetch } = trpc.agents.list.useQuery();

  const promoteMutation = trpc.agents.promote.useMutation({
    onSuccess: async (result) => {
      setPromotionResult(result);
      setPromotionBlocker(null);
      if (result.success) {
        toast({ title: `Agent moved to ${AGENT_STATUS_LABELS[result.status as AgentStatus]}` });
        await utils.agents.list.invalidate();
        await refetch();
      }
    },
    onError: (error) => {
      setPromotionResult(null);
      setPromotionBlocker(getAppBlocker(error));
    },
  });

  const importMutation = trpc.agents.importToCatalog.useMutation({
    onSuccess: async (result) => {
      toast({
        title: result.imported
          ? "Agent added to the Catalog candidate pipeline"
          : "Agent is already in the Catalog pipeline",
      });
      await utils.agents.list.invalidate();
    },
    onError: (error) => {
      showBlockerToast(error, "Catalog import blocked");
    },
  });

  const deleteMutation = trpc.agents.delete.useMutation({
    onSuccess: async () => {
      toast({ title: "Agent deleted successfully" });
      await utils.agents.list.invalidate();
      await refetch();
    },
    onError: (error) => {
      showBlockerToast(error, "Agent deletion blocked");
    },
  });

  const filteredAgents = useMemo(() => agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ), [agents, searchQuery]);

  const toggleAgentSelection = (agentId: number) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAgents.size === filteredAgents.length) {
      setSelectedAgents(new Set());
      return;
    }
    setSelectedAgents(new Set(filteredAgents.map((agent) => agent.id)));
  };

  const openPromotionDialog = (agent: any) => {
    setSelectedAgent(agent);
    setPromotionResult(null);
    setPromotionBlocker(null);
    setPromotionReason("");
    setPromotionDiff("");
    setPromoteDialogOpen(true);
  };

  const handleAdvance = () => {
    const targetStatus = selectedAgent ? getDefaultPromotionTarget((selectedAgent.status || "draft") as AgentStatus) : null;
    if (!selectedAgent || !targetStatus) {
      return;
    }

    if (!promotionReason.trim() || !promotionDiff.trim()) {
      setPromotionBlocker({
        code: "promotion_input_missing",
        category: "missing_input",
        title: "Required transition details are missing",
        summary: "This lifecycle action cannot continue until the required transition details are provided.",
        details: [
          "Governed transitions require a reason and a summary of the change.",
        ],
        missingRequirements: [
          ...(!promotionReason.trim() ? ["Reason"] : []),
          ...(!promotionDiff.trim() ? ["Diff summary"] : []),
        ],
        fieldIssues: [],
        recommendedActions: [
          "Add the missing transition details, then try the promotion again.",
        ],
        retryable: false,
        context: { agentId: selectedAgent.id, targetStatus },
      });
      return;
    }

    setPromotionBlocker(null);
    promoteMutation.mutate({
      id: selectedAgent.id,
      targetStatus,
      _evidence: {
        types: ["reason", "diff"],
        refs: [
          `reason:${promotionReason.trim()}`,
          `diff:${promotionDiff.trim()}`,
        ],
      },
    });
  };

  const handleBulkDelete = async () => {
    for (const agentId of selectedAgents) {
      await deleteMutation.mutateAsync({ id: agentId });
    }
    setSelectedAgents(new Set());
    setBulkActionOpen(false);
    toast({ title: `Deleted ${selectedAgents.size} agent(s)` });
  };

  const handleBulkExport = () => {
    const selectedData = agents.filter((agent) => selectedAgents.has(agent.id));
    const dataBlob = new Blob([JSON.stringify(selectedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agents-export-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    toast({ title: `Exported ${selectedAgents.size} agent(s)` });
  };

  const getNextStatus = (status: string) => getDefaultPromotionTarget(status as AgentStatus);

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="mt-1 text-muted-foreground">Draft, test, govern, and publish AI agent definitions through AI Types.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <Input
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
        {selectedAgents.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedAgents.size} selected</Badge>
            <Button variant="outline" size="sm" onClick={handleBulkExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkActionOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {filteredAgents.length > 0 && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
            {selectedAgents.size === filteredAgents.length ? (
              <CheckSquare className="mr-2 h-4 w-4" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            {selectedAgents.size === filteredAgents.length ? "Deselect All" : "Select All"}
          </Button>
        </div>
      )}

      {filteredAgents.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No agents found</h3>
          <p className="mb-4 text-muted-foreground">
            {searchQuery ? "Try a different search query" : "Create your first draft agent to get started"}
          </p>
          {!searchQuery && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Agent
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAgents.map((agent) => {
            const nextStatus = getNextStatus(agent.status || "draft");
            return (
              <Card key={agent.id} className="p-6">
                <div className="flex items-start gap-4">
                  <button onClick={() => toggleAgentSelection(agent.id)} className="mt-1 flex-shrink-0">
                    {selectedAgents.has(agent.id) ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="cursor-pointer text-lg font-semibold hover:text-primary" onClick={() => setLocation(`/agents/${agent.id}`)}>
                            {agent.name}
                          </h3>
                          <AgentStatusBadge status={agent.status || "draft"} />
                          {getComplianceBadge(agent)}
                        </div>
                        {agent.description && <p className="text-sm text-muted-foreground">{agent.description}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setLocation(`/agents/${agent.id}`)}>
                          <Edit2 className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
                        {nextStatus && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPromotionDialog(agent)}
                          >
                            <Shield className="mr-1 h-4 w-4" />
                            Move to {AGENT_STATUS_LABELS[nextStatus]}
                          </Button>
                        )}
                        {agent.status === "deployable" && (
                          <Button variant="outline" size="sm" onClick={() => importMutation.mutate({ id: agent.id })} disabled={importMutation.isPending}>
                            <Upload className="mr-1 h-4 w-4" />
                            Import to Catalog
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: agent.id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Created {format(new Date(agent.createdAt), "PPp")}</span>
                      <span>Role: {agent.roleClass}</span>
                      <span>Model: {agent.modelId}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance Agent Lifecycle</DialogTitle>
            <DialogDescription>
              {selectedAgent ? `Move ${selectedAgent.name} from ${AGENT_STATUS_LABELS[(selectedAgent.status || "draft") as AgentStatus]} to ${AGENT_STATUS_LABELS[getNextStatus(selectedAgent.status || "draft") as AgentStatus]}.` : "Advance the agent to the next allowed lifecycle stage."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {promotionBlocker && <AppBlockerAlert blocker={promotionBlocker} />}

            {promotionResult?.success ? (
              <p className="text-sm text-green-700">Lifecycle transition succeeded.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Governed validation is enforced before an agent can become deployable. Catalog import stays disabled until the agent reaches Deployable.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <Textarea
                    value={promotionReason}
                    onChange={(event) => setPromotionReason(event.target.value)}
                    placeholder="Explain why this agent should advance."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Diff Summary</label>
                  <Textarea
                    value={promotionDiff}
                    onChange={(event) => setPromotionDiff(event.target.value)}
                    placeholder="Summarize what changed and what was reviewed."
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            {promotionResult?.success ? (
              <Button onClick={() => setPromoteDialogOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleAdvance}
                  disabled={promoteMutation.isPending || !selectedAgent || !getNextStatus(selectedAgent.status || "draft")}
                >
                  {promoteMutation.isPending ? "Applying..." : "Advance"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={async () => {
          await utils.agents.list.invalidate();
          await refetch();
        }}
      />

      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agents</DialogTitle>
            <DialogDescription>
              Delete {selectedAgents.size} selected agent(s). This will archive them from the active list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
