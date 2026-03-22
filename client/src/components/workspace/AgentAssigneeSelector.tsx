/**
 * AgentAssigneeSelector — Dropdown showing workspace members + Catalog-available AI agents.
 *
 * Team Members section: hardcoded workspace members (future: query workspace members API).
 * AI Agents section: sourced from Catalog-available agents (status=active, reviewState=approved).
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Loader2 } from "lucide-react";
import { useCatalogAvailableAgents } from "@/hooks/useCatalogAvailable";

interface AssigneeSelectorProps {
  value: string;
  onChange: (value: string, type: "human" | "ai") => void;
}

const WORKSPACE_MEMBERS = [
  { id: "1", name: "User #1" },
  { id: "2", name: "User #2" },
  { id: "3", name: "User #3" },
];

export function AgentAssigneeSelector({ value, onChange }: AssigneeSelectorProps) {
  const { options: agents, isLoading } = useCatalogAvailableAgents();

  const handleChange = (val: string) => {
    const isAi = val.startsWith("agent-");
    onChange(val, isAi ? "ai" : "human");
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Assign to..." />
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
          Team Members
        </div>
        {WORKSPACE_MEMBERS.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              <span>{m.name}</span>
            </div>
          </SelectItem>
        ))}
        <div className="px-2 py-1 mt-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider border-t">
          AI Agents
        </div>
        {agents.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No agents available in Catalog
          </div>
        ) : (
          agents.map((agent) => (
            <SelectItem key={agent.id} value={`agent-${agent.id}`}>
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3 text-purple-500" />
                <span>{agent.label}</span>
                {agent.badge && (
                  <Badge variant="outline" className="text-[8px] ml-1">{agent.badge}</Badge>
                )}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
