import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function ParticipantsPanel({ projectId }: { projectId: number }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Participants</h2>
      <p className="text-sm text-muted-foreground">Humans + AI agents, roles, and authority boundaries</p>
      <Card><CardContent className="py-12 text-center">
        <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Participant management with role-based access control.</p>
        <p className="text-xs text-muted-foreground mt-1">PM Owner, Sponsors, Team Members, Stakeholders, AI Agents — each with defined authority boundaries.</p>
      </CardContent></Card>
    </div>
  );
}
