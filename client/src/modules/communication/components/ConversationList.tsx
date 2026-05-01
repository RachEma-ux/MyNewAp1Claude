/**
 * ConversationList — Communication conversations list.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ConversationListProps {
  workspaceId: number;
  selectedId?: number;
  onSelect?: (id: number) => void;
}

export function ConversationList(props: ConversationListProps) {
  const { data: conversations, isLoading } =
    trpc.communication.conversations.list.useQuery({
      workspaceId: props.workspaceId,
      limit: 100,
    });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  }
  if (!conversations || conversations.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground p-4">
          No conversations yet. Start a chat to create one.
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[60vh]">
      <div className="flex flex-col gap-1 p-1">
        {conversations.map((c) => {
          const active = props.selectedId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => props.onSelect?.(c.id)}
              className={`text-left rounded-md px-3 py-2 hover:bg-accent ${
                active ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{c.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {c.conversationType}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span>{c.status}</span>
                <span>·</span>
                <span>{new Date(c.updatedAt).toLocaleString()}</span>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
