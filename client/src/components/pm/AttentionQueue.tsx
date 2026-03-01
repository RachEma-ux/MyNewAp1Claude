/**
 * AttentionQueue — Sidebar card showing items needing PM attention
 *
 * Shows: overdue tasks, pending approvals, high risks, pending changes,
 * missing artifacts, open action items
 */

import { AlertTriangle, Clock, ShieldCheck, GitBranch, FileText, CheckSquare } from "lucide-react";

interface AttentionQueueProps {
  overdueTasksCount: number;
  approvalsPendingCount: number;
  highRisksCount: number;
  openIssuesCount: number;
  changesPendingCount: number;
  openActionItemsCount: number;
  pendingDeliverablesCount: number;
}

interface AttentionItem {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}

export default function AttentionQueue(props: AttentionQueueProps) {
  const items: AttentionItem[] = [
    { icon: <Clock className="h-3 w-3" />, label: "Overdue tasks", count: props.overdueTasksCount, color: "text-red-500" },
    { icon: <ShieldCheck className="h-3 w-3" />, label: "Pending approvals", count: props.approvalsPendingCount, color: "text-yellow-500" },
    { icon: <AlertTriangle className="h-3 w-3" />, label: "High risks", count: props.highRisksCount, color: "text-orange-500" },
    { icon: <AlertTriangle className="h-3 w-3" />, label: "Open issues", count: props.openIssuesCount, color: "text-red-400" },
    { icon: <GitBranch className="h-3 w-3" />, label: "Pending changes", count: props.changesPendingCount, color: "text-blue-500" },
    { icon: <CheckSquare className="h-3 w-3" />, label: "Action items", count: props.openActionItemsCount, color: "text-indigo-500" },
    { icon: <FileText className="h-3 w-3" />, label: "Pending deliverables", count: props.pendingDeliverablesCount, color: "text-purple-500" },
  ].filter(item => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Needs Attention
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <div className={`flex items-center gap-1.5 ${item.color}`}>
              {item.icon}
              <span>{item.label}</span>
            </div>
            <span className={`font-bold ${item.color}`}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
