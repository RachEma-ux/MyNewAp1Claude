import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal } from "lucide-react";

export default function PMShellPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PM Shell</h1>
        <p className="text-muted-foreground mt-1">
          Interactive project management command interface
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Shell Console</CardTitle>
          <Terminal className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm min-h-[300px]">
            <p className="text-muted-foreground">PM Shell ready. Type a command to get started.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
