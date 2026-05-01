/**
 * CommunicationSummaryCards — dashboard tiles for Communication.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  MessagesSquare,
  Video,
  Bell,
  Database,
} from "lucide-react";

export interface CommunicationSummaryCardsProps {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  scheduledMeetings: number;
  unreadNotifications: number;
  dbConnected: boolean;
}

export function CommunicationSummaryCards(props: CommunicationSummaryCardsProps) {
  const tiles = [
    {
      label: "Conversations",
      value: props.totalConversations,
      hint: `${props.activeConversations} active`,
      icon: <MessagesSquare className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Messages",
      value: props.totalMessages,
      hint: "across all conversations",
      icon: <MessageSquare className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Meetings",
      value: props.scheduledMeetings,
      hint: "scheduled",
      icon: <Video className="w-5 h-5 text-muted-foreground" />,
    },
    {
      label: "Notifications",
      value: props.unreadNotifications,
      hint: "unread",
      icon: <Bell className="w-5 h-5 text-muted-foreground" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
          <CardTitle className="text-sm font-medium">CommunicationDB</CardTitle>
          <Database className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Badge variant={props.dbConnected ? "default" : "destructive"}>
            {props.dbConnected ? "connected" : "unavailable"}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            dedicated communicationdb
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
