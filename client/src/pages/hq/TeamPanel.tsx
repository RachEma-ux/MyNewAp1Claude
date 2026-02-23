import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Users } from "lucide-react";

export default function TeamPanel() {
  const { data, isLoading, error } = trpc.hq.teamMembers.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load team: {error.message}
      </div>
    );
  }

  const members = data?.members ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground mt-1">
          Team members and roles
        </p>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No team members found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{m.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {m.email && (
                  <p className="text-sm text-muted-foreground">{m.email}</p>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                    {m.role}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-green-600 border-green-600"
                  >
                    {m.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
