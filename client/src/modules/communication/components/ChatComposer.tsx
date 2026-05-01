/**
 * ChatComposer — pick a provider, type a message, send through
 * Communication. Persistence + provider routing happens server-side.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface ChatComposerProps {
  workspaceId: number;
  conversationId?: number;
  onSent?: (conversationId: number) => void;
}

export function ChatComposer({
  workspaceId,
  conversationId,
  onSent,
}: ChatComposerProps) {
  const { data: providers } = trpc.chat.getAvailableProviders.useQuery();
  const [providerId, setProviderId] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();

  const sendMutation = trpc.communication.chat.sendMessage.useMutation({
    onSuccess: (result) => {
      setDraft("");
      onSent?.(result.conversationId);
      utils.communication.conversations.list.invalidate({ workspaceId });
      utils.communication.messages.listByConversation.invalidate({
        conversationId: result.conversationId,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const send = () => {
    if (!providerId) {
      toast.error("Select a provider first");
      return;
    }
    if (!draft.trim()) return;
    sendMutation.mutate({
      workspaceId,
      providerId,
      conversationId,
      messages: [{ role: "user", content: draft }],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={providerId?.toString()}
        onValueChange={(v) => setProviderId(Number(v))}
      >
        <SelectTrigger className="w-[260px]">
          <SelectValue placeholder="Select a provider" />
        </SelectTrigger>
        <SelectContent>
          {(providers ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id.toString()}>
              {p.name} ({p.type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type a message…"
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          onClick={send}
          disabled={sendMutation.isPending || !draft.trim()}
        >
          {sendMutation.isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
