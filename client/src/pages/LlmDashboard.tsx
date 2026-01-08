import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Plus, Settings, Rocket, ArrowRight, Archive, Edit, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function LlmDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: llms, isLoading, refetch } = trpc.llm.listWithVersions.useQuery({ includeArchived: false });
  const archiveMutation = trpc.llm.archive.useMutation({
    onSuccess: () => {
      toast({
        title: "LLM Archived",
        description: "The LLM has been archived successfully.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (llmId: number) => {
    setLocation(`/llm/control-plane?llmId=${llmId}&mode=edit`);
  };

  const handleClone = (llmId: number) => {
    setLocation(`/llm/control-plane?llmId=${llmId}&mode=clone`);
  };

  const handleArchive = (llmId: number, llmName: string) => {
    if (confirm(`Are you sure you want to archive "${llmName}"? It can be restored later.`)) {
      archiveMutation.mutate({ id: llmId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLM Control Plane</h1>
          <p className="text-muted-foreground mt-2">
            Manage your LLM configurations with immutable versioning
          </p>
        </div>
        <Link href="/llm/control-plane">
          <Button size="lg">
            <Plus className="mr-2 h-4 w-4" />
            Create New LLM
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total LLMs</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{llms?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active configurations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Local Runtime</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {llms?.filter(item => item.llm.runtime === 'local').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Local deployments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cloud Runtime</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {llms?.filter(item => item.llm.runtime === 'cloud').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Cloud deployments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* LLM List */}
      <Card>
        <CardHeader>
          <CardTitle>Registered LLMs</CardTitle>
          <CardDescription>
            All your LLM configurations. Click on an LLM to edit or view its version history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading LLMs...
            </div>
          ) : !llms || llms.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <Database className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <div>
                <p className="text-lg font-medium">No LLMs configured yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Get started by creating your first LLM configuration
                </p>
              </div>
              <Link href="/llm/control-plane">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First LLM
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {llms.map((item) => (
                <Card key={item.llm.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-xl">{item.llm.name}</CardTitle>
                        <CardDescription>{item.llm.description || 'No description'}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item.llm.id)}
                          title="Edit LLM (creates new version)"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClone(item.llm.id)}
                          title="Clone LLM"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleArchive(item.llm.id, item.llm.name)}
                          disabled={archiveMutation.isPending}
                          title="Archive LLM"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Runtime:</span>
                        <Badge variant={item.llm.runtime === 'local' ? 'default' : 'secondary'}>
                          {item.llm.runtime}
                        </Badge>
                      </div>
                      {item.llm.provider && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Provider:</span>
                          <Badge variant="outline">{item.llm.provider}</Badge>
                        </div>
                      )}
                      {item.version && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Version:</span>
                          <Badge variant="outline">v{item.version.version}</Badge>
                        </div>
                      )}
                      <div className="flex-1" />
                      <Link href={`/llm/control-plane?llmId=${item.llm.id}`}>
                        <Button variant="ghost" size="sm">
                          View Details
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
          <Link href="/llm/control-plane">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New LLM
              </CardTitle>
              <CardDescription>
                Start the wizard to create a new LLM configuration from scratch
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              View Archived
            </CardTitle>
            <CardDescription>
              Browse archived LLM configurations
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
