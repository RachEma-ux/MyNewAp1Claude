import { useState } from "react";
import AgentWizard from "@/components/AgentWizard";
import { Plus, Shield, AlertTriangle, Clock, Edit2, Trash2, CheckCircle2, Download, Trash, CheckSquare, Square, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function AgentsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [promotionResult, setPromotionResult] = useState<any>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Fetch agents (skip if wizard is open to avoid loading state)
  const { data: agents = [], isLoading, refetch } = trpc.agents.list.useQuery(undefined, {
    enabled: !wizardOpen,
  });

  // Promote agent mutation
  const promoteMutation = trpc.agents.promote.useMutation({
    onSuccess: (result) => {
      setPromotionResult(result);
      if (result.success) {
        toast({ title: "Agent promoted successfully" });
        refetch();
      }
    },
    onError: (error) => {
      toast({ title: "Failed to promote agent", description: error.message, variant: "destructive" });
    },
  });

  // Delete agent mutation
  const deleteMutation = trpc.agents.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Agent deleted successfully" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  // Bulk operations
  const toggleAgentSelection = (agentId: number) => {
    const newSelection = new Set(selectedAgents);
    if (newSelection.has(agentId)) {
      newSelection.delete(agentId);
    } else {
      newSelection.add(agentId);
    }
    setSelectedAgents(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedAgents.size === filteredAgents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(filteredAgents.map(a => a.id)));
    }
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
    const selectedData = agents.filter(a => selectedAgents.has(a.id));
    const dataStr = JSON.stringify(selectedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agents-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    toast({ title: `Exported ${selectedAgents.size} agent(s)` });
  };

  // Filter agents by search query
  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate compliance score for agent
  const getComplianceScore = (agent: any): number => {
    let score = 100;
    
    // Deduct points for various factors
    if (agent.temperature && parseFloat(agent.temperature) > 1.5) score -= 20;
    if (agent.systemPrompt?.length > 2000) score -= 15;
    if (agent.hasDocumentAccess && agent.hasToolAccess) score -= 10;
    if (agent.status === "draft") score -= 5;
    
    return Math.max(0, score);
  };

  // Get compliance badge with color coding
  const getComplianceBadge = (agent: any) => {
    const score = getComplianceScore(agent);
    
    if (score >= 90) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
          <TrendingUp className="w-3 h-3" />
          {score}%
        </Badge>
      );
    } else if (score >= 70) {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
          <TrendingUp className="w-3 h-3" />
          {score}%
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 flex items-center gap-1" title={`Compliance Score: ${score}%`}>
          <AlertTriangle className="w-3 h-3" />
          {score}%
        </Badge>
      );
    }
  };

  // Get governance badge
  const getGovernanceBadge = (status: string) => {
    switch (status) {
      case "SANDBOX":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Sandbox
        </Badge>;
      case "GOVERNED_VALID":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
          <Shield className="w-3 h-3 mr-1" />
          Governed
        </Badge>;
      case "GOVERNED_RESTRICTED":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Restricted
        </Badge>;
      case "GOVERNED_INVALIDATED":
        return <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Invalidated
        </Badge>;
      default:
        return null;
    }
  };

  // Check if sandbox is expiring soon (within 7 days)
  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const daysUntilExpiry = Math.floor(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Don't show loading skeleton - render page immediately with empty state while loading

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">
            Manage sandbox and governed AI agents
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Agent
        </Button>
      </div>

      {/* Search & Bulk Actions */}
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
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkActionOpen(true)}>
              <Trash className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Select All */}
      {filteredAgents.length > 0 && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
            {selectedAgents.size === filteredAgents.length ? (
              <CheckSquare className="w-4 h-4 mr-2" />
            ) : (
              <Square className="w-4 h-4 mr-2" />
            )}
            {selectedAgents.size === filteredAgents.length ? "Deselect All" : "Select All"}
          </Button>
        </div>
      )}

      {/* Agents List */}
      {filteredAgents.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery ? "Try a different search query" : "Create your first AI agent to get started"}
          </p>
          {!searchQuery && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Agent
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} className="p-6">
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggleAgentSelection(agent.id)}
                  className="mt-1 flex-shrink-0"
                >
                  {selectedAgents.has(agent.id) ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>

                {/* Agent Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 
                          className="text-lg font-semibold cursor-pointer hover:text-primary"
                          onClick={() => setLocation(`/agents/${agent.id}`)}
                        >
                          {agent.name}
                        </h3>
                        {getGovernanceBadge(agent.status || "draft")}
                        {getComplianceBadge(agent)}
                      </div>
                      {agent.description && (
                        <p className="text-sm text-muted-foreground">{agent.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/agents/${agent.id}`)}
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      {agent.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAgent(agent);
                            setPromotionResult(null);
                            setPromoteDialogOpen(true);
                          }}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Promote
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate({ id: agent.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {format(new Date(agent.createdAt), "PPp")}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Promotion Dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote Agent to Governed</DialogTitle>
            <DialogDescription>
              This will evaluate the agent against the promotion policy and generate a cryptographic proof.
            </DialogDescription>
          </DialogHeader>

          {promotionResult ? (
            <div className="space-y-4">
              {promotionResult.success ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Promotion successful!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Promotion denied</span>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium text-red-900">Policy violations:</p>
                    {promotionResult.violations?.map((violation: string, i: number) => (
                      <p key={i} className="text-sm text-red-700">• {violation}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Agent: <span className="font-medium">{selectedAgent?.name}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                This will check if the agent meets all governance requirements including budget limits,
                side-effect restrictions, and permission requirements.
              </p>
            </div>
          )}

          <DialogFooter>
            {promotionResult ? (
              <Button onClick={() => setPromoteDialogOpen(false)}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedAgent) {
                      promoteMutation.mutate({ id: selectedAgent.id });
                    }
                  }}
                  disabled={promoteMutation.isPending}
                >
                  {promoteMutation.isPending ? "Evaluating..." : "Promote"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Creation Wizard */}
      <AgentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={refetch}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Multiple Agents</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedAgents.size} agent(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete {selectedAgents.size} Agent(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
