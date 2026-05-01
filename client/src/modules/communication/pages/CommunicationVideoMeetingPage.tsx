/**
 * /communication/video-meeting — schedule + manage meetings.
 *
 * Meetings here are records, not real WebRTC sessions. The
 * meeting URL is treated as an opaque external link.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MeetingList } from "../components/MeetingList";
import { toast } from "sonner";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function CommunicationVideoMeetingPage() {
  const workspaceId = useDefaultWorkspaceId();
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<
    "video" | "audio" | "text" | "hybrid"
  >("video");
  const [meetingUrl, setMeetingUrl] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.communication.meetings.create.useMutation({
    onSuccess: () => {
      utils.communication.meetings.list.invalidate();
      setTitle("");
      setMeetingUrl("");
      toast.success("Meeting scheduled");
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
            <CardTitle className="text-sm">Schedule a meeting</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
            />
            <Select
              value={meetingType}
              onValueChange={(v) =>
                setMeetingType(v as "video" | "audio" | "text" | "hybrid")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">video</SelectItem>
                <SelectItem value="audio">audio</SelectItem>
                <SelectItem value="text">text</SelectItem>
                <SelectItem value="hybrid">hybrid</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="Meeting URL (optional)"
            />
            <Button
              onClick={() =>
                create.mutate({
                  workspaceId,
                  title,
                  meetingType,
                  meetingUrl: meetingUrl || undefined,
                })
              }
              disabled={create.isPending || !title.trim()}
            >
              {create.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingList workspaceId={workspaceId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
