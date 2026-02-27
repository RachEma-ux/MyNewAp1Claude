/**
 * AgentAssigneeSelector — Dropdown showing workspace members + AI agents
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";

interface AssigneeSelectorProps {
  value: string;
  onChange: (value: string, type: "human" | "ai") => void;
}

const MOCK_MEMBERS = [
  { id: "1", name: "User #1", type: "human" as const },
  { id: "2", name: "User #2", type: "human" as const },
  { id: "3", name: "User #3", type: "human" as const },
];

const MOCK_AGENTS = [
  { id: "ai-1", name: "Task Planner Agent", type: "ai" as const, model: "claude-3.5-sonnet" },
  { id: "ai-2", name: "Code Review Agent", type: "ai" as const, model: "gpt-4o" },
  { id: "ai-3", name: "QA Tester Agent", type: "ai" as const, model: "claude-3-haiku" },
];

export function AgentAssigneeSelector({ value, onChange }: AssigneeSelectorProps) {
  const handleChange = (val: string) => {
    const isAi = val.startsWith("ai-");
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
        {MOCK_MEMBERS.map((m) => (
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
        {MOCK_AGENTS.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <div className="flex items-center gap-2">
              <Bot className="h-3 w-3 text-purple-500" />
              <span>{a.name}</span>
              <Badge variant="outline" className="text-[8px] ml-1">{a.model}</Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
