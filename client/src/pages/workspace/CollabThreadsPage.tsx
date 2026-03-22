/**
 * Collaboration Threads — Thread list + thread detail with messages
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MessageSquare, Send, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  discussion: "bg-blue-500/10 text-blue-500",
  approval: "bg-yellow-500/10 text-yellow-500",
  meeting_notes: "bg-green-500/10 text-green-500",
};

export function CollabThreadsPage({ workspaceId }: { workspaceId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [threadType, setThreadType] = useState<string>("discussion");
  const [selectedThread, setSelectedThread] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");

  const utils = trpc.useUtils();
  const { data: threads, isLoading } = trpc.modules.collaboration.threads.list.useQuery({
    workspaceId,
  });

  const { data: messages } = trpc.modules.collaboration.messages.list.useQuery(
    { threadId: selectedThread!, workspaceId },
    { enabled: !!selectedThread }
  );

  const { data: selectedThreadData } = trpc.modules.collaboration.threads.get.useQuery(
    { id: selectedThread!, workspaceId },
    { enabled: !!selectedThread }
  );

  const createThreadMut = trpc.modules.collaboration.threads.create.useMutation({
    onSuccess: (result) => {
      utils.modules.collaboration.threads.list.invalidate();
      setCreateOpen(false);
      setTitle("");
      setSelectedThread(result.id);
      toast.success("Thread created");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMsgMut = trpc.modules.collaboration.messages.create.useMutation({
    onSuccess: () => {
      utils.modules.collaboration.messages.list.invalidate();
      utils.modules.collaboration.threads.list.invalidate();
      setNewMessage("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteThreadMut = trpc.modules.collaboration.threads.delete.useMutation({
    onSuccess: () => {
      utils.modules.collaboration.threads.list.invalidate();
      setSelectedThread(null);
      toast.success("Thread deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Thread detail view
  if (selectedThread) {
    return (
      <div className="flex flex-col h-full">
        {/* Thread header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedThread(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {selectedThreadData?.title || "Thread"}
            </p>
            <div className="flex items-center gap-2">
              {selectedThreadData?.type && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${typeColors[selectedThreadData.type] || ""}`}
                >
                  {selectedThreadData.type}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {selectedThreadData?.status || "open"}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              if (confirm("Delete this thread?")) {
                deleteThreadMut.mutate({ id: selectedThread, workspaceId });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {messages && messages.length > 0 ? (
              messages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                    {msg.authorType === "ai" ? "AI" : "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {msg.authorType === "ai" ? "AI Agent" : `User #${msg.authorId}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                      {msg.editedAt && (
                        <span className="text-[10px] text-muted-foreground">(edited)</span>
                      )}
                    </div>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                No messages yet. Start the conversation.
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Message input */}
        <div className="border-t p-3 flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && newMessage.trim()) {
                e.preventDefault();
                sendMsgMut.mutate({
                  workspaceId,
                  threadId: selectedThread,
                  content: newMessage,
                });
              }
            }}
          />
          <Button
            size="icon"
            disabled={!newMessage.trim() || sendMsgMut.isPending}
            onClick={() =>
              sendMsgMut.mutate({
                workspaceId,
                threadId: selectedThread,
                content: newMessage,
              })
            }
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Thread list view
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Threads
        </h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Thread
        </Button>
      </div>

      {threads && threads.length > 0 ? (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Card
              key={thread.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSelectedThread(thread.id)}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{thread.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {thread.type && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${typeColors[thread.type] || ""}`}
                      >
                        {thread.type}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {thread.status || "open"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(thread.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No threads yet.</p>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Thread</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Thread topic"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={threadType} onValueChange={setThreadType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discussion">Discussion</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                  <SelectItem value="meeting_notes">Meeting Notes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createThreadMut.mutate({
                  workspaceId,
                  title,
                  type: threadType as "discussion" | "approval" | "meeting_notes",
                })
              }
              disabled={!title.trim() || createThreadMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
