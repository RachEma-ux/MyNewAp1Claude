import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function ThreadsPanel({ projectId }: { projectId: number }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Threads</h2>
      <p className="text-sm text-muted-foreground">Project-wide and per-task/deliverable discussion threads</p>
      <Card><CardContent className="py-12 text-center">
        <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Collaboration threads will appear here.</p>
        <p className="text-xs text-muted-foreground mt-1">Threads are linked to tasks, deliverables, risks, and decisions for full context.</p>
      </CardContent></Card>
    </div>
  );
}
