/**
 * PMStatusCards — dashboard tiles for PM Central RTLM.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  CheckSquare,
  AlertTriangle,
  Bug,
  Inbox,
  Database,
  Activity,
  Clock,
} from "lucide-react";

export interface PMStatusCardsProps {
  totalProjects: number;
  activeProjects: number;
  blockedProjects: number;
  overdueMilestones: number;
  openRisks: number;
  openIssues: number;
  pendingHandoffs: number;
  dbConnected: boolean;
}

export function PMStatusCards(props: PMStatusCardsProps) {
  const tiles = [
    {
      label: "Projects",
      value: props.totalProjects,
      hint: `${props.activeProjects} active`,
      icon: <FolderKanban className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Blocked",
      value: props.blockedProjects,
      hint: "projects in blocked state",
      icon: <Activity className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Overdue",
      value: props.overdueMilestones,
      hint: "milestones past due",
      icon: <Clock className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Open risks",
      value: props.openRisks,
      hint: "open or monitoring",
      icon: <AlertTriangle className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Open issues",
      value: props.openIssues,
      hint: "open or in-progress",
      icon: <Bug className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Pending handoffs",
      value: props.pendingHandoffs,
      hint: "awaiting accept/convert",
      icon: <Inbox className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Tasks",
      value: "—",
      hint: "see project detail",
      icon: <CheckSquare className="w-5 h-5 text-muted-foreground" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.label}</CardTitle>
            {t.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{t.value}</div>
            <p className="text-xs text-muted-foreground">{t.hint}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">PMDB</CardTitle>
          <Database className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Badge variant={props.dbConnected ? "default" : "destructive"}>
            {props.dbConnected ? "connected" : "unavailable"}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">dedicated pmdb</p>
        </CardContent>
      </Card>
    </div>
  );
}
