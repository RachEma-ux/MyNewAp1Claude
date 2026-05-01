/**
 * /communication/conversations — list + manage Communication
 * conversations (archive / delete / rename).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConversationList } from "../components/ConversationList";
import { MessageThread } from "../components/MessageThread";
import { toast } from "sonner";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function CommunicationConversationsPage() {
  const workspaceId = useDefaultWorkspaceId();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const utils = trpc.useUtils();

  const archive = trpc.communication.conversations.archive.useMutation({
    onSuccess: () => {
      utils.communication.conversations.list.invalidate();
      toast.success("Archived");
    },
    onError: (err) => toast.error(err.message),
  });
  const del = trpc.communication.conversations.delete.useMutation({
    onSuccess: () => {
      utils.communication.conversations.list.invalidate();
      setConversationId(undefined);
      toast.success("Deleted");
    },
    onError: (err) => toast.error(err.message),
  });

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
      <div className="md:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">
              {conversationId ? `Thread #${conversationId}` : "Pick a conversation"}
            </CardTitle>
            {conversationId ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archive.mutate({ id: conversationId })}
                  disabled={archive.isPending}
                >
                  Archive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this conversation?")) {
                      del.mutate({ id: conversationId });
                    }
                  }}
                  disabled={del.isPending}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {conversationId ? (
              <MessageThread conversationId={conversationId} />
            ) : (
              <div className="text-sm text-muted-foreground p-4 border rounded-md">
                Select a conversation from the list.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
