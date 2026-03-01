import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar } from "lucide-react";

export default function MeetingsPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.meetings.list.useQuery({ projectId });
  const meetings = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Meetings</h2>
      <p className="text-sm text-muted-foreground">Agenda → Minutes → Action Items workflow</p>
      {meetings.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No meetings scheduled.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {meetings.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span className="capitalize">{m.meetingType}</span>
                      {m.scheduledAt && <span>{new Date(m.scheduledAt).toLocaleString()}</span>}
                      {m.duration && <span>{m.duration} min</span>}
                    </div>
                  </div>
                  <Badge variant={m.status === "completed" ? "default" : "outline"} className="text-[10px]">{m.status}</Badge>
                </div>
                {m.agenda && <p className="text-xs text-muted-foreground mt-1.5 border-t pt-1.5">Agenda: {m.agenda}</p>}
                {m.minutes && <p className="text-xs mt-1">Minutes: {m.minutes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
