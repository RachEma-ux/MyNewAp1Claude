import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Package, Settings } from "lucide-react";

export default function PacksRunnersPanel() {
  const { data, isLoading, error } = trpc.governance.controlCatalog.useQuery();

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
        Failed to load packs: {error.message}
      </div>
    );
  }

  const controls = data?.controls || [];
  const runners = data?.runners || [];
  const packs = data?.availablePacks || [];

  // Group controls by pack
  const byPack: Record<string, any[]> = {};
  for (const c of controls) {
    const pack = c.pack || "unknown";
    if (!byPack[pack]) byPack[pack] = [];
    byPack[pack].push(c);
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Packs & Runners</h1>
        <p className="text-muted-foreground mt-2">
          Control packs grouped by subject type, and registered runners
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{packs.length}</p>
            <p className="text-xs text-muted-foreground">Available Packs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{runners.length}</p>
            <p className="text-xs text-muted-foreground">Registered Runners</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{controls.length}</p>
            <p className="text-xs text-muted-foreground">Total Controls</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 mb-8">
        {Object.entries(byPack).map(([pack, packControls]) => (
          <Card key={pack}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Pack: {pack}
                <Badge variant="outline">{packControls.length} controls</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {packControls.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                      <span className="text-sm">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        c.severity === "critical" ? "destructive" :
                        c.severity === "high" ? "outline" : "secondary"
                      }>
                        {c.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{c.runnerId}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Registered Runners ({runners.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runners.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {runners.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                  <Badge variant="outline" className="font-mono text-xs">{r.id}</Badge>
                  <span className="text-sm">{r.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No runners registered</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
