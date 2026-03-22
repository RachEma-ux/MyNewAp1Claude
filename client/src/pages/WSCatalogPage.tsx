/**
 * WS Catalog — Published workspace menu for participants
 *
 * Shows only published and active workspaces.
 * Participant-facing — does NOT expose draft/review management inventory.
 */

import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageShell } from "@/components/app";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Zap, ArrowRight, Sparkles } from "lucide-react";

export default function WSCatalogPage() {
  const [, navigate] = useLocation();
  const { data: published, isLoading } = trpc.wsCatalog.listPublished.useQuery();

  return (
    <PageShell
      title="Workspace Catalog"
      subtitle="Discover and join available workspaces"
    >
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading catalog...</div>
      ) : !published?.length ? (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No workspaces are currently published</p>
          <p className="text-xs text-muted-foreground mt-1">
            Workspaces become available here after they are published by administrators.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {published.map((ws: any) => (
            <Card
              key={ws.id}
              className="hover:border-primary/30 transition-colors cursor-pointer group"
              onClick={() => navigate(`/w/${ws.id}/overview`)}
            >
              <CardContent className="py-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium">{ws.name}</h3>
                  <Badge
                    variant="outline"
                    className={
                      ws.status === "active"
                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                        : "bg-cyan-500/10 text-cyan-600 border-cyan-500/20"
                    }
                  >
                    {ws.status === "active" ? (
                      <><Zap className="h-3 w-3 mr-1" /> Active</>
                    ) : (
                      <><Globe className="h-3 w-3 mr-1" /> Published</>
                    )}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {ws.description || "No description provided"}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    {ws.type && <Badge variant="secondary" className="text-xs">{ws.type}</Badge>}
                    {(ws as any).purposeType && (
                      <Badge variant="secondary" className="text-xs">{(ws as any).purposeType}</Badge>
                    )}
                  </div>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
