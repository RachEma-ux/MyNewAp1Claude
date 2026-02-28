import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function MethodsPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PM Methods</h1>
        <p className="text-muted-foreground mt-1">
          Project management methodologies — PM², Scrum, PRINCE2, Waterfall, and more
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Available Methods</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Browse and adopt project management methods for your projects.</p>
        </CardContent>
      </Card>
    </div>
  );
}
