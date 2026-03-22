/**
 * WSCrewPage — AI participant management within a workspace
 *
 * Shows workspace AI agents (crew), their roles, capabilities, and constraints.
 * Distinct from Team (human participants).
 */

import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Plus, Power, PowerOff, Trash2 } from "lucide-react";

export function WSCrewPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("executor");

  const utils = trpc.useUtils();
  const { data: crew, isLoading } = trpc.workspaces.crew.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0 }
  );

  const addMutation = trpc.workspaces.crew.add.useMutation({
    onSuccess: () => {
      utils.workspaces.crew.list.invalidate({ workspaceId });
      toast.success("Crew member added");
      setShowAdd(false);
      setNewName("");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.workspaces.crew.remove.useMutation({
    onSuccess: () => {
      utils.workspaces.crew.list.invalidate({ workspaceId });
      toast.success("Crew member removed");
    },
  });

  const toggleMutation = trpc.workspaces.crew.update.useMutation({
    onSuccess: () => {
      utils.workspaces.crew.list.invalidate({ workspaceId });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> Crew
          </h2>
          <p className="text-sm text-muted-foreground">AI participants in this workspace</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> Add Agent
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="py-3 flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block">Agent Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Role</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="executor">Executor</SelectItem>
                  <SelectItem value="advisor">Advisor</SelectItem>
                  <SelectItem value="monitor">Monitor</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (newName.trim()) {
                  addMutation.mutate({
                    workspaceId,
                    agentId: 0,
                    agentName: newName,
                    role: newRole,
                  });
                }
              }}
            >
              Add
            </Button>
          </CardContent>
        </Card>
      )}

      {!(crew as any[])?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No AI crew members yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add AI agents to participate in this workspace.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(crew as any[]).map((agent: any) => (
            <Card key={agent.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm ${agent.enabled ? "bg-primary/10" : "bg-muted"}`}>
                  <Bot className={`h-4 w-4 ${agent.enabled ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{agent.agentName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-xs">{agent.role}</Badge>
                    {!agent.enabled && <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleMutation.mutate({ workspaceId, crewId: agent.id, enabled: !agent.enabled })}
                  >
                    {agent.enabled ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeMutation.mutate({ workspaceId, crewId: agent.id })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default WSCrewPage;
