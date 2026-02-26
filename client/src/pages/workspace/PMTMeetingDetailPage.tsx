/**
 * PMT Meeting Detail — Agenda, minutes, action items, decisions tabs
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Plus, Trash2, Check, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";

const ITEM_TYPES = [
  { key: "agenda", label: "Agenda" },
  { key: "minutes", label: "Minutes" },
  { key: "action_item", label: "Action Items" },
  { key: "decision", label: "Decisions" },
];

export function PMTMeetingDetailPage({ workspaceId }: { workspaceId: number }) {
  const params = useParams<{ meetingId: string }>();
  const meetingId = parseInt(params.meetingId || "0", 10);

  const utils = trpc.useUtils();

  const { data: meeting, isLoading: meetingLoading } = trpc.modules.pmt.meetings.get.useQuery(
    { id: meetingId, workspaceId },
    { enabled: !!meetingId }
  );

  const { data: items, isLoading: itemsLoading } = trpc.modules.pmt.meetings.items.list.useQuery(
    { meetingId },
    { enabled: !!meetingId }
  );

  const createItemMut = trpc.modules.pmt.meetings.items.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.meetings.items.list.invalidate();
      toast.success("Item added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateItemMut = trpc.modules.pmt.meetings.items.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.meetings.items.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteItemMut = trpc.modules.pmt.meetings.items.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.meetings.items.list.invalidate();
      toast.success("Item removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (meetingLoading || itemsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Meeting not found.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Back link + header */}
      <div className="flex items-center gap-3">
        <Link href={`/workspaces/${workspaceId}/projects/meetings`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(meeting.startTime).toLocaleString()}
              {meeting.endTime && ` — ${new Date(meeting.endTime).toLocaleTimeString()}`}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {meeting.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agenda">
        <TabsList>
          {ITEM_TYPES.map((it) => (
            <TabsTrigger key={it.key} value={it.key}>
              {it.label}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {(items || []).filter((i: any) => i.itemType === it.key).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {ITEM_TYPES.map((it) => (
          <TabsContent key={it.key} value={it.key} className="mt-3">
            <ItemList
              workspaceId={workspaceId}
              meetingId={meetingId}
              itemType={it.key}
              items={(items || []).filter((i: any) => i.itemType === it.key)}
              showDone={it.key === "action_item"}
              onToggleDone={(item: any) =>
                updateItemMut.mutate({ id: item.id, workspaceId, done: !item.done })
              }
              onDelete={(id: number) =>
                deleteItemMut.mutate({ id, workspaceId })
              }
              onCreate={(content: string) => {
                const position = (items || []).filter((i: any) => i.itemType === it.key).length;
                createItemMut.mutate({
                  meetingId,
                  workspaceId,
                  itemType: it.key,
                  content,
                  position,
                });
              }}
              isCreating={createItemMut.isPending}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ItemList({
  workspaceId,
  meetingId,
  itemType,
  items,
  showDone,
  onToggleDone,
  onDelete,
  onCreate,
  isCreating,
}: {
  workspaceId: number;
  meetingId: number;
  itemType: string;
  items: any[];
  showDone: boolean;
  onToggleDone: (item: any) => void;
  onDelete: (id: number) => void;
  onCreate: (content: string) => void;
  isCreating: boolean;
}) {
  const [draft, setDraft] = useState("");

  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="space-y-2">
      {sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No {itemType.replace("_", " ")} items yet.
        </p>
      )}
      {sorted.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 border rounded-md px-3 py-2"
        >
          {showDone && (
            <button
              onClick={() => onToggleDone(item)}
              className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                item.done
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-muted-foreground/30 hover:border-primary"
              }`}
            >
              {item.done && <Check className="h-3 w-3" />}
            </button>
          )}
          <span className={`flex-1 text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>
            {item.content}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {/* Add item */}
      <div className="flex gap-2 pt-2">
        <Input
          placeholder={`Add ${itemType.replace("_", " ")}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onCreate(draft.trim());
              setDraft("");
            }
          }}
        />
        <Button
          size="sm"
          disabled={!draft.trim() || isCreating}
          onClick={() => {
            onCreate(draft.trim());
            setDraft("");
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
