/**
 * Agent Roster — Workspace agent management
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Bot, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  assistant: "bg-blue-500/10 text-blue-500",
  autonomous: "bg-purple-500/10 text-purple-500",
  reviewer: "bg-green-500/10 text-green-500",
  orchestrator: "bg-orange-500/10 text-orange-500",
};

export function AgentsRosterPage({ workspaceId }: { workspaceId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("assistant");

  const utils = trpc.useUtils();
  const { data: agents, isLoading } = trpc.modules.agentOrch.agents.list.useQuery({ workspaceId });

  const createMut = trpc.modules.agentOrch.agents.create.useMutation({
    onSuccess: () => {
      utils.modules.agentOrch.agents.list.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("Agent created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.agentOrch.agents.delete.useMutation({
    onSuccess: () => {
      utils.modules.agentOrch.agents.list.invalidate();
      toast.success("Agent deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const requestRunMut = trpc.modules.agentOrch.runs.request.useMutation({
    onSuccess: () => {
      toast.success("Run requested");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Agent Roster
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agents?.length || 0} agents registered
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : agents && agents.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {agent.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${typeColors[agent.type || "assistant"] || ""}`}
                  >
                    {agent.type || "assistant"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    {agent.status || "active"}
                  </Badge>
                  {agent.tools && (agent.tools as string[]).length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {(agent.tools as string[]).length} tools
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      requestRunMut.mutate({ workspaceId, agentId: agent.id })
                    }
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Run
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      if (confirm("Delete this agent?")) {
                        deleteMut.mutate({ id: agent.id, workspaceId });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No agents registered yet.</p>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent name"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant">Assistant</SelectItem>
                  <SelectItem value="autonomous">Autonomous</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="orchestrator">Orchestrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createMut.mutate({
                  workspaceId,
                  name,
                  description: description || undefined,
                  type: type as "assistant" | "autonomous" | "reviewer" | "orchestrator",
                })
              }
              disabled={!name.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
