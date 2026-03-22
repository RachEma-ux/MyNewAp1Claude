/**
 * PMT Task Detail Drawer — Slide-over panel showing full work item details
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Paperclip, Link2 } from "lucide-react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  story: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  epic: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  milestone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  feature: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

const priorityColors: Record<string, string> = {
  low: "text-green-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

const STATUSES = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

interface PMTTaskDetailDrawerProps {
  workspaceId: number;
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PMTTaskDetailDrawer({
  workspaceId,
  taskId,
  open,
  onOpenChange,
}: PMTTaskDetailDrawerProps) {
  const utils = trpc.useUtils();

  const { data: task, isLoading } = trpc.modules.pmt.tasks.get.useQuery(
    { id: taskId!, workspaceId },
    { enabled: !!taskId }
  );

  const updateMut = trpc.modules.pmt.tasks.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.get.invalidate();
      utils.modules.pmt.tasks.list.invalidate();
      toast.success("Task updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Inline description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  const handleTitleSave = () => {
    if (task && titleDraft.trim() && titleDraft !== task.title) {
      updateMut.mutate({ id: task.id, workspaceId, title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescSave = () => {
    if (task) {
      updateMut.mutate({ id: task.id, workspaceId, description: descDraft });
    }
    setEditingDesc(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[min(32rem,100vw)] flex flex-col overflow-y-auto">
        {!task ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Task not found
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={typeColors[task.type || "task"] || typeColors.task}>
                  {task.type || "task"}
                </Badge>
                <Badge variant="outline" className={priorityColors[task.priority] || ""}>
                  {task.priority}
                </Badge>
                <Select
                  value={task.status}
                  onValueChange={(v) =>
                    updateMut.mutate({ id: task.id, workspaceId, status: v })
                  }
                >
                  <SelectTrigger className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingTitle ? (
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                  className="text-lg font-semibold"
                />
              ) : (
                <SheetTitle
                  className="cursor-pointer hover:text-primary transition-colors text-left"
                  onClick={() => {
                    setTitleDraft(task.title);
                    setEditingTitle(true);
                  }}
                >
                  {task.title}
                </SheetTitle>
              )}
            </SheetHeader>

            <Separator />

            {/* Fields Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm px-4">
              <div>
                <span className="text-muted-foreground text-xs">Assignee</span>
                <p>{task.assigneeType === "ai" ? "AI Agent" : task.assigneeId ? `User #${task.assigneeId}` : "Unassigned"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Priority</span>
                <Select
                  value={task.priority}
                  onValueChange={(v) =>
                    updateMut.mutate({ id: task.id, workspaceId, priority: v })
                  }
                >
                  <SelectTrigger className="h-7 mt-0.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Due Date</span>
                <p>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Start Date</span>
                <p>{task.startDate ? new Date(task.startDate).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Estimated Hours</span>
                <p>{task.estimatedHours ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Story Points</span>
                <p>{task.storyPoints ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Progress ({task.percentComplete ?? 0}%)</span>
                <Progress value={task.percentComplete ?? 0} className="mt-1" />
              </div>
              {task.labels && (task.labels as string[]).length > 0 && (
                <div className="col-span-2 flex gap-1 flex-wrap">
                  {(task.labels as string[]).map((label) => (
                    <Badge key={label} variant="secondary" className="text-[10px]">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Tabs */}
            <ScrollArea className="flex-1 px-4">
              <Tabs defaultValue="details">
                <TabsList className="w-full">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="comments">Comments</TabsTrigger>
                  <TabsTrigger value="attachments">Attachments</TabsTrigger>
                  <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-3">
                  {editingDesc ? (
                    <div className="space-y-2">
                      <Textarea
                        autoFocus
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={6}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleDescSave}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[60px] whitespace-pre-wrap"
                      onClick={() => {
                        setDescDraft(task.description || "");
                        setEditingDesc(true);
                      }}
                    >
                      {task.description || "Click to add a description..."}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="comments" className="mt-3">
                  <CommentThread workspaceId={workspaceId} workItemId={task.id} />
                </TabsContent>

                <TabsContent value="attachments" className="mt-3">
                  <AttachmentList workspaceId={workspaceId} workItemId={task.id} />
                </TabsContent>

                <TabsContent value="dependencies" className="mt-3">
                  <DependencyList workspaceId={workspaceId} taskId={task.id} />
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── Comment Thread ── */

function CommentThread({ workspaceId, workItemId }: { workspaceId: number; workItemId: number }) {
  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.modules.pmt.comments.list.useQuery({
    workspaceId,
    workItemId,
  });

  const createMut = trpc.modules.pmt.comments.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.comments.list.invalidate();
      setDraft("");
      toast.success("Comment added");
    },
    onError: (e) => toast.error(e.message),
  });

  const [draft, setDraft] = useState("");


  // Group comments: top-level vs replies
  const topLevel = (comments || []).filter((c) => !c.parentId);
  const replies = (comments || []).filter((c) => c.parentId);

  return (
    <div className="space-y-3">
      {topLevel.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}
      {topLevel.map((comment) => (
        <div key={comment.id} className="space-y-1">
          <div className="rounded-md border p-2 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {comment.authorType === "ai" ? "AI" : `User #${comment.authorId}`}
              </span>
              <span>{new Date(comment.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
          </div>
          {/* Replies indented */}
          {replies
            .filter((r) => r.parentId === comment.id)
            .map((reply) => (
              <div key={reply.id} className="ml-4 rounded-md border p-2 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {reply.authorType === "ai" ? "AI" : `User #${reply.authorId}`}
                  </span>
                  <span>{new Date(reply.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
              </div>
            ))}
        </div>
      ))}

      {/* Compose */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a comment..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="flex-1"
        />
        <Button
          size="icon"
          disabled={!draft.trim() || createMut.isPending}
          onClick={() =>
            createMut.mutate({ workspaceId, workItemId, content: draft.trim() })
          }
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ── Attachment List ── */

function AttachmentList({ workspaceId, workItemId }: { workspaceId: number; workItemId: number }) {
  const { data: attachments, isLoading } = trpc.modules.pmt.attachments.list.useQuery({
    workspaceId,
    workItemId,
  });


  return (
    <div className="space-y-2">
      {(!attachments || attachments.length === 0) && (
        <p className="text-sm text-muted-foreground">No attachments.</p>
      )}
      {attachments?.map((att) => (
        <div key={att.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{att.fileName}</span>
          <span className="text-xs text-muted-foreground">
            {att.fileSize < 1024
              ? `${att.fileSize} B`
              : att.fileSize < 1024 * 1024
              ? `${(att.fileSize / 1024).toFixed(1)} KB`
              : `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`}
          </span>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" disabled>
        <Paperclip className="h-4 w-4 mr-1" />
        Upload Attachment (coming soon)
      </Button>
    </div>
  );
}

/* ── Dependency List ── */

function DependencyList({ workspaceId, taskId }: { workspaceId: number; taskId: number }) {
  const { data: deps, isLoading } = trpc.modules.pmt.dependencies.list.useQuery({
    workspaceId,
    taskId,
  });


  return (
    <div className="space-y-2">
      {(!deps || deps.length === 0) && (
        <p className="text-sm text-muted-foreground">No dependencies.</p>
      )}
      {deps?.map((dep) => (
        <div key={dep.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{dep.type}</span>
          <span className="text-muted-foreground">Task #{dep.dependsOnId}</span>
        </div>
      ))}
    </div>
  );
}
