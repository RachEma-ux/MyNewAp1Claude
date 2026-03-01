/**
 * QuickCreate — Command palette for creating PM entities
 *
 * Plus button that opens a dropdown with: New task, risk, issue,
 * change request, decision, status update, meeting, action item
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, CheckSquare, AlertTriangle, AlertCircle, GitBranch,
  Stamp, FileText, Calendar, ListChecks,
} from "lucide-react";

interface QuickCreateProps {
  projectId: number;
  onSelect: (type: string) => void;
}

const QUICK_ITEMS = [
  { type: "task", label: "New Task", icon: CheckSquare, group: "work" },
  { type: "deliverable", label: "New Deliverable", icon: FileText, group: "work" },
  { type: "risk", label: "New Risk", icon: AlertTriangle, group: "control" },
  { type: "issue", label: "New Issue", icon: AlertCircle, group: "control" },
  { type: "change", label: "New Change Request", icon: GitBranch, group: "control" },
  { type: "decision", label: "New Decision", icon: Stamp, group: "followup" },
  { type: "action_item", label: "New Action Item", icon: ListChecks, group: "followup" },
  { type: "status_update", label: "New Status Update", icon: FileText, group: "followup" },
  { type: "meeting", label: "New Meeting", icon: Calendar, group: "collab" },
];

export default function QuickCreate({ projectId, onSelect }: QuickCreateProps) {
  return (
    <div className="px-3 py-2 border-b">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-7">
            <Plus className="h-3.5 w-3.5" />
            Quick Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs">Work</DropdownMenuLabel>
          {QUICK_ITEMS.filter(i => i.group === "work").map(item => (
            <DropdownMenuItem key={item.type} onClick={() => onSelect(item.type)} className="text-xs gap-2">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Control</DropdownMenuLabel>
          {QUICK_ITEMS.filter(i => i.group === "control").map(item => (
            <DropdownMenuItem key={item.type} onClick={() => onSelect(item.type)} className="text-xs gap-2">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Follow-up</DropdownMenuLabel>
          {QUICK_ITEMS.filter(i => i.group === "followup").map(item => (
            <DropdownMenuItem key={item.type} onClick={() => onSelect(item.type)} className="text-xs gap-2">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Collaboration</DropdownMenuLabel>
          {QUICK_ITEMS.filter(i => i.group === "collab").map(item => (
            <DropdownMenuItem key={item.type} onClick={() => onSelect(item.type)} className="text-xs gap-2">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
