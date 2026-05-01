/**
 * MessageThread — render messages for a Communication conversation.
 */

import { trpc } from "@/lib/trpc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface MessageThreadProps {
  conversationId: number;
}

export function MessageThread({ conversationId }: MessageThreadProps) {
  const { data, isLoading } =
    trpc.communication.messages.listByConversation.useQuery(
      { conversationId, limit: 200 },
      { enabled: conversationId > 0 },
    );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No messages yet.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[55vh] border rounded-md">
      <div className="flex flex-col gap-3 p-3">
        {data.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">
                {m.role}
              </Badge>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
