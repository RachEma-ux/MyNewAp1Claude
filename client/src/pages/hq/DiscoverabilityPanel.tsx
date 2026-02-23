import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Database, Cloud, Box, Layers } from "lucide-react";

export default function DiscoverabilityPanel() {
  const { data, isLoading, error } = trpc.hq.discoverability.useQuery();

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
        Failed to load discoverability data: {error.message}
      </div>
    );
  }

  const stats = [
    { label: "Catalog Entries", value: data?.catalogEntries ?? 0, icon: Database },
    { label: "Providers", value: data?.providerCount ?? 0, icon: Cloud },
    { label: "Models", value: data?.modelCount ?? 0, icon: Box },
    { label: "Total Items", value: data?.totalItems ?? 0, icon: Layers },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discoverability</h1>
        <p className="text-muted-foreground mt-1">
          Platform catalog entries, providers, and models
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
