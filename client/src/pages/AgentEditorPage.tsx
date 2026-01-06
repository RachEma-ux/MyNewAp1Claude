import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Play, Square, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DiffViewer } from "@/components/DiffViewer";
import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass, AgentAnatomy, AgentGovernance } from "@shared/types";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("anatomy");

  const { data: agent, isLoading, refetch } = trpc.agents.get.useQuery(
    { id: parseInt(id!) },
    { enabled: !!id }
  );

  const updateMutation = trpc.agents.update.useMutation({
    onSuccess: () => {
      toast({ title: "Agent updated successfully" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to update agent", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = trpc.agents.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Agent deleted successfully" });
      setLocation("/agents");
    },
    onError: (error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="text-center">Loading agent...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container py-8">
        <div className="text-center">Agent not found</div>
      </div>
    );
  }

  const handleSave = () => {
    updateMutation.mutate({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      anatomy: agent.anatomy,
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this agent?")) {
      deleteMutation.mutate({ id: agent.id });
    }
  };

  const getStatusBadge = () => {
    const status = agent.governanceStatus || "SANDBOX";
    const variants: Record<string, any> = {
      SANDBOX: "secondary",
      GOVERNED_VALID: "default",
      GOVERNED_RESTRICTED: "outline",
      GOVERNED_INVALIDATED: "destructive",
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/agents")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="text-muted-foreground">{agent.description}</p>
          </div>
          {getStatusBadge()}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          <Button variant="outline" size="sm">
            <Play className="h-4 w-4 mr-2" />
            Start
          </Button>
          <Button variant="outline" size="sm">
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="anatomy">Anatomy</TabsTrigger>
          <TabsTrigger value="governance" disabled={agent.mode === "sandbox"}>
            Governance
          </TabsTrigger>
          <TabsTrigger value="diff">Diff</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Anatomy Tab */}
        <TabsContent value="anatomy">
          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <Label>Name</Label>
                <Input value={agent.name} readOnly />
              </div>
              <div>
                <Label>Version</Label>
                <Input value={agent.version} readOnly />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={agent.description || ""} readOnly rows={3} />
              </div>
              <div>
                <Label>Role Class</Label>
                <Select value={agent.roleClass} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assistant">Assistant</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="executor">Executor</SelectItem>
                    <SelectItem value="monitor">Monitor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>System Prompt</Label>
                <Textarea
                  value={(agent.anatomy as AgentAnatomy)?.systemPrompt || ""}
                  readOnly
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label>Tools</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {((agent.anatomy as AgentAnatomy)?.tools || []).map((tool: string) => (
                    <Badge key={tool} variant="outline">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Governance Tab */}
        <TabsContent value="governance">
          <Card className="p-6">
            {agent.mode === "governed" ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Proof Bundle</h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Agent Hash</Label>
                      <Input value={(agent.governance as AgentGovernance)?.proofBundle?.agentHash || "N/A"} readOnly className="font-mono text-sm" />
                    </div>
                    <div>
                      <Label>Policy Hash</Label>
                      <Input value={(agent.governance as AgentGovernance)?.proofBundle?.policyHash || "N/A"} readOnly className="font-mono text-sm" />
                    </div>
                    <div>
                      <Label>Signature</Label>
                      <Input value={(agent.governance as AgentGovernance)?.proofBundle?.signature || "N/A"} readOnly className="font-mono text-sm" />
                    </div>
                    <div>
                      <Label>Evaluated At</Label>
                      <Input
                        value={(agent.governance as AgentGovernance)?.proofBundle?.evaluatedAt ? new Date((agent.governance as AgentGovernance).proofBundle!.evaluatedAt).toLocaleString() : "N/A"}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-4">Verification Status</h3>
                  <Badge variant={agent.governanceStatus === "GOVERNED_VALID" ? "default" : "destructive"}>
                    {agent.governanceStatus === "GOVERNED_VALID" ? "PASS" : "FAIL"}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Governance information is only available for governed agents.
                <br />
                Promote this agent to view governance details.
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Diff Tab */}
        <TabsContent value="diff">
          <Card className="p-6">
            {agent.mode === "governed" ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Agent Specification</h3>
                  <DiffViewer
                    oldValue={JSON.stringify(
                      {
                        name: agent.name,
                        version: agent.version,
                        roleClass: agent.roleClass,
                        mode: "sandbox",
                      },
                      null,
                      2
                    )}
                    newValue={JSON.stringify(
                      {
                        name: agent.name,
                        version: agent.version,
                        roleClass: agent.roleClass,
                        mode: "governed",
                        governanceStatus: agent.governanceStatus,
                      },
                      null,
                      2
                    )}
                    oldLabel="Before Promotion"
                    newLabel="After Promotion"
                  />
                </div>
                {(agent.anatomy as AgentAnatomy)?.systemPrompt && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">System Prompt</h3>
                    <DiffViewer
                      oldValue={(agent.anatomy as AgentAnatomy).systemPrompt!}
                      newValue={(agent.anatomy as AgentAnatomy).systemPrompt!}
                      oldLabel="Sandbox"
                      newLabel="Governed"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Diff view is only available for governed agents.
                <br />
                Promote this agent to view changes.
              </div>
            )}
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6">Version History</h3>
            <div className="space-y-4">
              {/* Timeline */}
              <div className="relative border-l-2 border-muted pl-6 space-y-6">
                {/* Created Event */}
                <div className="relative">
                  <div className="absolute -left-[1.6rem] w-4 h-4 rounded-full bg-blue-500 border-4 border-background" />
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">Agent Created</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Initial agent configuration with {agent.mode} mode
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(agent.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="outline">created</Badge>
                  </div>
                </div>

                {/* Promotion Event (if governed) */}
                {agent.mode === "governed" && agent.governance && (
                  <div className="relative">
                    <div className="absolute -left-[1.6rem] w-4 h-4 rounded-full bg-green-500 border-4 border-background" />
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">Promoted to Governed</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Policy evaluation passed, cryptographic proof generated
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date((agent.governance as AgentGovernance).proofBundle!.evaluatedAt).toLocaleString()}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground mt-1">
                          Proof: {(agent.governance as AgentGovernance).proofBundle!.signature.substring(0, 16)}...
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        promoted
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Last Updated Event */}
                {agent.updatedAt && agent.updatedAt !== agent.createdAt && (
                  <div className="relative">
                    <div className="absolute -left-[1.6rem] w-4 h-4 rounded-full bg-orange-500 border-4 border-background" />
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">Agent Modified</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Configuration or settings updated
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(agent.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline">modified</Badge>
                    </div>
                  </div>
                )}

                {/* Status Update Events (if invalidated/restricted) */}
                {agent.governanceStatus === "GOVERNED_INVALIDATED" && (
                  <div className="relative">
                    <div className="absolute -left-[1.6rem] w-4 h-4 rounded-full bg-red-500 border-4 border-background" />
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">Status Changed to Invalidated</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Policy changes caused governance invalidation
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(agent.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="destructive">invalidated</Badge>
                    </div>
                  </div>
                )}

                {agent.governanceStatus === "GOVERNED_RESTRICTED" && (
                  <div className="relative">
                    <div className="absolute -left-[1.6rem] w-4 h-4 rounded-full bg-yellow-500 border-4 border-background" />
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">Status Changed to Restricted</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Agent capabilities restricted by policy
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(agent.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                        restricted
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="mt-8 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Full version history with detailed change tracking will be available once the agent_history table is migrated.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
