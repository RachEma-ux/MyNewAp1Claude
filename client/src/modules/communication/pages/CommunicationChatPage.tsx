/**
 * /communication/chat — provider-backed chat with persisted history.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatComposer } from "../components/ChatComposer";
import { MessageThread } from "../components/MessageThread";
import { ConversationList } from "../components/ConversationList";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function CommunicationChatPage() {
  const workspaceId = useDefaultWorkspaceId();
  const [conversationId, setConversationId] = useState<number | undefined>();

  if (!workspaceId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Resolving workspace…
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <ConversationList
              workspaceId={workspaceId}
              selectedId={conversationId}
              onSelect={(id) => setConversationId(id)}
            />
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2 flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {conversationId
                ? `Thread #${conversationId}`
                : "Start a new chat"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversationId ? (
              <MessageThread conversationId={conversationId} />
            ) : (
              <div className="text-sm text-muted-foreground p-4 border rounded-md">
                Select a conversation or send a message to start a new one.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Composer</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatComposer
              workspaceId={workspaceId}
              conversationId={conversationId}
              onSent={(id) => setConversationId(id)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
